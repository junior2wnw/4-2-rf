import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { LinkedAgent } from "@4-2/contracts";

import type { AppEnv } from "../config/env.js";
import { classifyOpenAiRuntimeIssue } from "../lib/openai-runtime.js";
import type { MetricsService } from "./metrics-service.js";

type MemoryContext = {
  query: string;
  results: Array<{
    text: string;
    wing: string;
    room: string;
    sourceFile: string;
    similarity: number;
  }>;
} | null;

type PlannerClient = {
  responses: {
    create: (body: Record<string, unknown>) => Promise<unknown>;
    parse: (body: Record<string, unknown>) => Promise<{ id?: string; output_parsed: unknown }>;
  };
};

const executionPlanSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("answer"),
    assistantText: z.string().trim().min(1).max(12_000),
  }),
  z.object({
    mode: z.literal("local_task"),
    assistantText: z.string().trim().min(1).max(4_000),
    title: z.string().trim().min(3).max(120),
    summary: z.string().trim().min(8).max(600),
    command: z.string().trim().min(1).max(8_000),
    workingDirectory: z.string().trim().min(1).max(500).nullable().optional(),
    timeoutSeconds: z.number().int().min(5).max(900),
    shell: z.enum(["powershell", "sh"]),
  }),
]);

type ExecutionPlan = z.infer<typeof executionPlanSchema>;
export type PlannerRuntimeStatus = "demo" | "live" | "degraded";

const RUNTIME_STATUS_TTL_MS = 60_000;

const blockedCommandPatterns = [
  { pattern: /\brm\s+-rf\s+\/($|\s)/i, message: "Refusing a destructive filesystem wipe." },
  {
    pattern: /\bRemove-Item\b[^\n\r]*-Recurse[^\n\r]*-Force/i,
    message: "Refusing a forced recursive delete command.",
  },
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/i, message: "Refusing a reboot or shutdown." },
  { pattern: /\bformat\b/i, message: "Refusing a disk format command." },
  { pattern: /\bdiskpart\b/i, message: "Refusing a partitioning command." },
  {
    pattern: /\b(schtasks|crontab|launchctl|systemctl)\b[^\n\r]*(create|enable|bootstrap)/i,
    message: "Refusing a persistence-changing command.",
  },
  {
    pattern: /\b(reg add|defaults write)\b[^\n\r]*(run|launchagents|launchdaemons)/i,
    message: "Refusing a persistence-changing command.",
  },
  {
    pattern: /\b(curl|wget|Invoke-WebRequest)\b[^\n\r]*\|\s*(sh|bash|pwsh|powershell|iex)\b/i,
    message: "Refusing a pipe-to-shell command.",
  },
  { pattern: /\b(Invoke-Expression|iex)\b/i, message: "Refusing inline shell evaluation." },
];

export class ExecutionPlannerService {
  private readonly client: PlannerClient | null;
  private runtimeCache: { status: PlannerRuntimeStatus; checkedAt: number } | null = null;
  private runtimeProbe: Promise<PlannerRuntimeStatus> | null = null;

  public constructor(
    private readonly env: AppEnv,
    private readonly metrics: MetricsService,
    client?: PlannerClient | null,
  ) {
    this.client =
      client ??
      (env.OPENAI_API_KEY
        ? new OpenAI({
            apiKey: env.OPENAI_API_KEY,
            maxRetries: 2,
            timeout: env.OPENAI_TIMEOUT_MS,
          })
        : null);
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  public async getRuntimeStatus(): Promise<PlannerRuntimeStatus> {
    if (!this.client) {
      return "demo";
    }

    const now = Date.now();
    if (this.runtimeCache && now - this.runtimeCache.checkedAt < RUNTIME_STATUS_TTL_MS) {
      return this.runtimeCache.status;
    }

    if (!this.runtimeProbe) {
      this.runtimeProbe = this.probeRuntimeStatus().finally(() => {
        this.runtimeProbe = null;
      });
    }

    return this.runtimeProbe;
  }

  public async planTurn(input: {
    prompt: string;
    previousResponseId: string | null;
    memoryContext: MemoryContext;
    sessionDisplayName: string;
    linkedAgent: LinkedAgent | null;
  }): Promise<{ responseId: string; plan: ExecutionPlan }> {
    if (!this.client) {
      this.metrics.markPlannerDecision("fallback");
      return {
        responseId: `demo_${Date.now()}`,
        plan: {
          mode: "answer",
          assistantText:
            "Live model is unavailable right now, so local execution planning is disabled. Connect a valid OpenAI key to enable execution planning.",
        },
      };
    }

    const startedAt = performance.now();

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await this.client.responses.parse({
          model: this.env.OPENAI_MODEL,
          previous_response_id: input.previousResponseId ?? undefined,
          instructions: buildPlannerInstructions({
            sessionDisplayName: input.sessionDisplayName,
            linkedAgent: input.linkedAgent,
            memoryContext: input.memoryContext,
            retrying: attempt > 0,
          }),
          input: input.prompt,
          store: true,
          max_output_tokens: Math.min(this.env.OPENAI_MAX_OUTPUT_TOKENS, 1600),
          reasoning: { effort: this.env.OPENAI_REASONING_EFFORT },
          text: {
            format: zodTextFormat(executionPlanSchema, "execution_plan"),
          },
        });

        const parsed = executionPlanSchema.safeParse(response.output_parsed);
        if (!parsed.success) {
          continue;
        }

        let plan = parsed.data;
        if (plan.mode === "local_task") {
          if (!input.linkedAgent?.isConnected) {
            this.metrics.markPlannerDecision("fallback");
            plan = {
              mode: "answer",
              assistantText:
                "To execute this on a device, connect the local agent first. After the device is linked, send the same request again and I will run it there.",
            };
          } else {
            const localTaskPlan = plan;
            const safetyBlock = blockedCommandPatterns.find((rule) =>
              rule.pattern.test(localTaskPlan.command),
            );
            if (safetyBlock) {
              this.metrics.markPlannerDecision("fallback");
              plan = {
                mode: "answer",
                assistantText: `${safetyBlock.message} I can still explain the safe manual steps or generate a less privileged alternative.`,
              };
            } else {
              plan = {
                ...localTaskPlan,
                shell: shellForAgent(input.linkedAgent),
                workingDirectory: normalizeWorkingDirectory(localTaskPlan.workingDirectory),
              };
            }
          }
        }

        this.metrics.observeOpenAi({
          mode: "plan",
          status: "ok",
          durationMs: performance.now() - startedAt,
        });
        this.metrics.markPlannerDecision(plan.mode);
        return {
          responseId: response.id ?? `resp_plan_${Date.now()}`,
          plan,
        };
      }

      throw new Error("Structured planner output could not be parsed.");
    } catch (error) {
      this.metrics.observeOpenAi({
        mode: "plan",
        status: "error",
        durationMs: performance.now() - startedAt,
      });
      throw error;
    }
  }

  private async probeRuntimeStatus(): Promise<PlannerRuntimeStatus> {
    if (!this.client) {
      return "demo";
    }

    const startedAt = performance.now();

    try {
      await this.client.responses.create({
        model: this.env.OPENAI_MODEL,
        input: "Respond with the single word ok.",
        max_output_tokens: 8,
        store: false,
        reasoning: { effort: "minimal" },
      });

      this.metrics.observeOpenAi({
        mode: "probe",
        status: "ok",
        durationMs: performance.now() - startedAt,
      });
      this.runtimeCache = { status: "live", checkedAt: Date.now() };
      return "live";
    } catch (error) {
      this.metrics.observeOpenAi({
        mode: "probe",
        status: "error",
        durationMs: performance.now() - startedAt,
      });
      const status = classifyOpenAiRuntimeIssue(error) === "configuration" ? "demo" : "degraded";
      this.runtimeCache = { status, checkedAt: Date.now() };
      return status;
    }
  }
}

function buildPlannerInstructions(input: {
  sessionDisplayName: string;
  linkedAgent: LinkedAgent | null;
  memoryContext: MemoryContext;
  retrying: boolean;
}): string {
  const lines = [
    "You are the 4-2 execution planner.",
    "Decide whether to answer directly or queue one local shell task on the user's linked device.",
    "Return valid JSON matching the schema exactly.",
    "Choose mode=local_task only when the user clearly wants a real action performed on the connected device right now.",
    "Never claim a local task succeeded before it actually runs.",
    "If there is no connected agent, you must choose mode=answer.",
    "Prefer a single safe shell command or short inline script over long multi-step installers.",
    "Do not request elevation, persistence changes, reboots, shutdowns, or destructive wipes.",
    "Do not output markdown fences in command fields.",
    `Current session label: ${input.sessionDisplayName}.`,
  ];

  if (input.linkedAgent?.isConnected) {
    lines.push(
      `Connected agent: hostname=${input.linkedAgent.hostname}, platform=${input.linkedAgent.platform}, arch=${input.linkedAgent.arch}, scope=${input.linkedAgent.scope}.`,
    );
  } else {
    lines.push("Connected agent: none.");
  }

  if (input.memoryContext?.results.length) {
    lines.push("Retrieved memory context:");
    for (const [index, result] of input.memoryContext.results.entries()) {
      lines.push(
        `${index + 1}. [wing=${result.wing} room=${result.room} source=${result.sourceFile} similarity=${result.similarity}] ${result.text}`,
      );
    }
  } else {
    lines.push("No memory context was retrieved for this turn.");
  }

  if (input.retrying) {
    lines.push("Previous planner output failed validation. Be extra strict about the schema this time.");
  }

  lines.push(
    "For mode=answer, assistantText should fully answer the user with concise, practical guidance.",
  );
  lines.push(
    "For mode=local_task, assistantText should say the task was queued and describe what will happen, not the result.",
  );
  lines.push(
    "For mode=local_task, timeoutSeconds must be realistic and between 5 and 900 seconds.",
  );

  return lines.join("\n");
}

function shellForAgent(agent: LinkedAgent): "powershell" | "sh" {
  return agent.platform === "windows" ? "powershell" : "sh";
}

function normalizeWorkingDirectory(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

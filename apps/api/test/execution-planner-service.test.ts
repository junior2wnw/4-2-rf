import { describe, expect, it, vi } from "vitest";

import type { LinkedAgent } from "@4-2/contracts";

import { parseEnv } from "../src/config/env.js";
import { ExecutionPlannerService } from "../src/services/execution-planner-service.js";

const env = parseEnv({
  DATABASE_URL: "postgres://db",
  API_PUBLIC_BASE_URL: "http://localhost:8080",
  WEB_PUBLIC_BASE_URL: "http://localhost:3000",
  MEMORY_SIDECAR_URL: "http://localhost:8090",
  INSTALLER_BASE_URL: "http://localhost:8080/v1/installers",
  OPENAI_API_KEY: "test-key",
});

const metrics = {
  observeOpenAi: vi.fn(),
  markPlannerDecision: vi.fn(),
} as const;

describe("ExecutionPlannerService", () => {
  it("normalizes the shell to powershell for windows agents", async () => {
    const service = new ExecutionPlannerService(
      env,
      metrics as never,
      {
        responses: {
          create: vi.fn(),
          parse: vi.fn().mockResolvedValue({
            id: "resp_plan_1",
            output_parsed: {
              mode: "local_task",
              assistantText: "Queued.",
              title: "Write file",
              summary: "Create a local file.",
              command: "Set-Content -Path $env:TEMP\\demo.txt -Value 'hello'",
              timeoutSeconds: 60,
              shell: "sh",
              workingDirectory: null,
            },
          }),
        },
      } as never,
    );

    const result = await service.planTurn({
      prompt: "Create a file on my machine",
      previousResponseId: null,
      memoryContext: null,
      sessionDisplayName: "Website visitor",
      linkedAgent: connectedAgent("windows"),
    });

    expect(result.plan.mode).toBe("local_task");
    if (result.plan.mode === "local_task") {
      expect(result.plan.shell).toBe("powershell");
    }
  });

  it("falls back to a direct answer for blocked destructive commands", async () => {
    const service = new ExecutionPlannerService(
      env,
      metrics as never,
      {
        responses: {
          create: vi.fn(),
          parse: vi.fn().mockResolvedValue({
            id: "resp_plan_2",
            output_parsed: {
              mode: "local_task",
              assistantText: "Queued.",
              title: "Delete disk",
              summary: "Dangerous task.",
              command: "rm -rf /",
              timeoutSeconds: 60,
              shell: "sh",
              workingDirectory: null,
            },
          }),
        },
      } as never,
    );

    const result = await service.planTurn({
      prompt: "Destroy the machine",
      previousResponseId: null,
      memoryContext: null,
      sessionDisplayName: "Website visitor",
      linkedAgent: connectedAgent("linux"),
    });

    expect(result.plan.mode).toBe("answer");
    if (result.plan.mode === "answer") {
      expect(result.plan.assistantText).toContain("Refusing");
    }
  });
});

function connectedAgent(platform: LinkedAgent["platform"]): LinkedAgent {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    hostname: "device-1",
    platform,
    arch: "amd64",
    scope: "user",
    status: "ready",
    agentVersion: "0.1.0",
    osVersion: platform,
    lastSeenAt: new Date().toISOString(),
    linkedAt: new Date().toISOString(),
    isConnected: true,
  };
}

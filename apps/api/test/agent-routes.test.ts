import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { parseEnv } from "../src/config/env.js";

describe("agent routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects task claims with an invalid heartbeat token", async () => {
    const app = await buildAgentApp({
      repository: {
        isValidAgentHeartbeat: vi.fn().mockResolvedValue(false),
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/agents/tasks/claim",
      payload: {
        agentId: "11111111-1111-4111-8111-111111111111",
        heartbeatToken: "heartbeat-token-1234567890",
      },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("completes an agent task and returns the updated task payload", async () => {
    const app = await buildAgentApp({
      repository: {
        isValidAgentHeartbeat: vi.fn().mockResolvedValue(true),
        getAgentTaskExecutionDetails: vi.fn().mockResolvedValue({
          title: "Write report",
          summary: "Create the report on disk.",
          command: "Write-Output 'done'",
          workingDirectory: "C:\\Temp",
        }),
        completeAgentTask: vi.fn().mockResolvedValue({
          id: "00000000-0000-0000-0000-000000000010",
          assistantMessageId: "00000000-0000-0000-0000-000000000011",
          title: "Write report",
          summary: "Create the report on disk.",
          command: "Write-Output 'done'",
          workingDirectory: "C:\\Temp",
          status: "succeeded",
          exitCode: 0,
          stdout: "done",
          stderr: null,
          assistantContent: "completed",
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        }),
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/agents/tasks/00000000-0000-0000-0000-000000000010/complete",
      payload: {
        agentId: "11111111-1111-4111-8111-111111111111",
        heartbeatToken: "heartbeat-token-1234567890",
        status: "succeeded",
        exitCode: 0,
        stdout: "done",
        stderr: null,
        startedAt: "2026-04-12T00:00:01.000Z",
        finishedAt: "2026-04-12T00:00:02.000Z",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().task.status).toBe("succeeded");
    await app.close();
  });
});

async function buildAgentApp(overrides?: {
  repository?: Record<string, unknown>;
}) {
  const env = parseEnv({
    DATABASE_URL: "postgres://db",
    API_PUBLIC_BASE_URL: "http://localhost:8080",
    WEB_PUBLIC_BASE_URL: "http://localhost:3000",
    MEMORY_SIDECAR_URL: "http://localhost:8090",
    INSTALLER_BASE_URL: "http://localhost:8080/v1/installers",
  });

  const app = await buildApp({
    env,
    services: {
      chat: {
        isLiveModelEnabled: vi.fn().mockReturnValue(false),
        streamResponse: vi.fn(),
      } as never,
      downloads: {
        loadManifest: vi.fn(),
        readArtifact: vi.fn(),
      } as never,
      planner: {
        isConfigured: vi.fn().mockReturnValue(false),
        getRuntimeStatus: vi.fn().mockResolvedValue("demo"),
        planTurn: vi.fn(),
      } as never,
      knowledge: {
        captureSuccessfulTurn: vi.fn(),
      } as never,
      memory: {
        searchForScope: vi.fn().mockResolvedValue(null),
        healthcheck: vi.fn().mockResolvedValue(true),
      } as never,
      metrics: {
        observeHttp: vi.fn(),
        observeOpenAi: vi.fn(),
        markMemoryLookup: vi.fn(),
        markAgentHeartbeat: vi.fn(),
        markKnowledgePromotion: vi.fn(),
        markPlannerDecision: vi.fn(),
        markAgentTask: vi.fn(),
        render: vi.fn(),
        contentType: vi.fn().mockReturnValue("text/plain"),
      } as never,
      repository: {
        ping: vi.fn(),
        createAgentRegistration: vi.fn(),
        recordHeartbeat: vi.fn(),
        isValidAgentHeartbeat: vi.fn().mockResolvedValue(true),
        claimNextAgentTask: vi.fn().mockResolvedValue(null),
        getAgentTaskExecutionDetails: vi.fn().mockResolvedValue(null),
        completeAgentTask: vi.fn().mockResolvedValue(null),
        ...overrides?.repository,
      } as never,
    },
  });

  await app.ready();
  return app;
}

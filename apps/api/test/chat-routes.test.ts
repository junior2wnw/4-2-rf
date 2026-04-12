import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { parseEnv } from "../src/config/env.js";

describe("chat routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a session token to fetch session state", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/chat/sessions/00000000-0000-0000-0000-000000000001",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("streams a queued local task when the planner selects execution", async () => {
    const app = await buildTestApp({
      planner: {
        isConfigured: vi.fn().mockReturnValue(true),
        planTurn: vi.fn().mockResolvedValue({
          responseId: "resp_plan_1",
          plan: {
            mode: "local_task",
            assistantText: "Queued.",
            title: "Write report",
            summary: "Create a report on disk.",
            command: "Write-Output 'hello'",
            timeoutSeconds: 60,
            shell: "powershell",
            workingDirectory: "C:\\Temp",
          },
        }),
        getRuntimeStatus: vi.fn().mockResolvedValue("live"),
      },
      repository: {
        getReadyAgentForSession: vi.fn().mockResolvedValue({
          id: "00000000-0000-0000-0000-000000000010",
          hostname: "device-1",
          platform: "windows",
          arch: "amd64",
          scope: "user",
          status: "ready",
          agentVersion: "0.1.0",
          osVersion: "windows",
          lastSeenAt: new Date().toISOString(),
          linkedAt: new Date().toISOString(),
          isConnected: true,
        }),
        createAgentTask: vi.fn().mockResolvedValue({
          id: "00000000-0000-0000-0000-000000000020",
          assistantMessageId: "00000000-0000-0000-0000-000000000011",
          title: "Write report",
          summary: "Create a report on disk.",
          status: "queued",
          exitCode: null,
          stdout: null,
          stderr: null,
          assistantContent: null,
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
        }),
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions/00000000-0000-0000-0000-000000000001/messages",
      headers: {
        "content-type": "application/json",
        "x-session-token": "session-token-123",
      },
      payload: {
        clientMessageId: "client-msg-0001",
        content: "Create a local report on my device",
        enableMemory: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: task_queued");
    expect(response.body).toContain("Write report");

    await app.close();
  });

  it("falls back to the chat stream when live planning is unavailable", async () => {
    const planTurn = vi.fn();
    const streamResponse = vi.fn().mockImplementation(async function* () {
      yield { type: "delta", delta: "Demo " };
      yield {
        type: "completed",
        outputText: "Demo fallback answer",
        responseId: "demo_1",
      };
    });

    const app = await buildTestApp({
      chat: {
        streamResponse,
      },
      planner: {
        isConfigured: vi.fn().mockReturnValue(true),
        getRuntimeStatus: vi.fn().mockResolvedValue("demo"),
        planTurn,
      },
      repository: {
        saveMessage: vi
          .fn()
          .mockResolvedValueOnce({
            id: "00000000-0000-0000-0000-000000000010",
            role: "user",
            content: "Say hello",
            createdAt: new Date().toISOString(),
          })
          .mockResolvedValueOnce({
            id: "00000000-0000-0000-0000-000000000011",
            role: "assistant",
            content: "Demo fallback answer",
            createdAt: new Date().toISOString(),
          }),
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions/00000000-0000-0000-0000-000000000001/messages",
      headers: {
        "content-type": "application/json",
        "x-session-token": "session-token-123",
      },
      payload: {
        clientMessageId: "client-msg-0002",
        content: "Say hello",
        enableMemory: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: delta");
    expect(response.body).toContain("event: complete");
    expect(response.body).not.toContain("event: task_queued");
    expect(planTurn).not.toHaveBeenCalled();
    expect(streamResponse).toHaveBeenCalledOnce();

    await app.close();
  });
});

async function buildTestApp(overrides?: {
  chat?: Record<string, unknown>;
  planner?: Record<string, unknown>;
  repository?: Record<string, unknown>;
}) {
  const env = parseEnv({
    DATABASE_URL: "postgres://db",
    API_PUBLIC_BASE_URL: "http://localhost:8080",
    WEB_PUBLIC_BASE_URL: "http://localhost:3000",
    MEMORY_SIDECAR_URL: "http://localhost:8090",
    INSTALLER_BASE_URL: "http://localhost:8080/v1/installers",
  });

  const repository = {
    ping: vi.fn(),
    createChatSession: vi.fn(),
    getChatSessionForAccess: vi.fn().mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000001",
      displayName: "Website visitor",
      createdAt: new Date().toISOString(),
      previousResponseId: null,
    }),
    listChatMessages: vi.fn().mockResolvedValue([]),
    listLinkedAgents: vi.fn().mockResolvedValue([]),
    listPendingAgentTasks: vi.fn().mockResolvedValue([]),
    hasClientMessage: vi.fn().mockResolvedValue(false),
    saveMessage: vi
      .fn()
      .mockResolvedValueOnce({
        id: "00000000-0000-0000-0000-000000000010",
        role: "user",
        content: "Create a local report on my device",
        createdAt: new Date().toISOString(),
      })
      .mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000011",
        role: "assistant",
        content: "Queued local task",
        createdAt: new Date().toISOString(),
      }),
    updateSessionResponseId: vi.fn(),
    getReadyAgentForSession: vi.fn().mockResolvedValue(null),
    createAgentTask: vi.fn(),
    ...overrides?.repository,
  };

  const app = await buildApp({
    env,
    services: {
      chat: {
        isLiveModelEnabled: vi.fn().mockReturnValue(false),
        streamResponse: vi.fn().mockImplementation(async function* () {
          yield {
            type: "completed",
            outputText: "Default response",
            responseId: "default_resp_1",
          };
        }),
        ...overrides?.chat,
      } as never,
      downloads: {
        loadManifest: vi.fn(),
        readArtifact: vi.fn(),
      } as never,
      planner: {
        isConfigured: vi.fn().mockReturnValue(false),
        getRuntimeStatus: vi.fn().mockResolvedValue("demo"),
        planTurn: vi.fn(),
        ...overrides?.planner,
      } as never,
      knowledge: {
        captureSuccessfulTurn: vi.fn().mockResolvedValue({ created: false, skipped: true }),
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
      repository: repository as never,
    },
  });

  await app.ready();
  return app;
}

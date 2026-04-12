import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import {
  chatMessageRequestSchema,
  chatSessionCreateSchema,
  chatSessionStateSchema,
} from "@4-2/contracts";

import {
  renderCompletedAgentTaskMessage,
  renderQueuedAgentTaskMessage,
} from "../lib/agent-task-content.js";

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/chat/sessions", async (request, reply) => {
    const input = chatSessionCreateSchema.parse(request.body);
    const session = await app.services.repository.createChatSession(input);
    reply.code(201);
    return session;
  });

  app.get("/v1/chat/sessions/:sessionId", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const session = await requireSession(request, reply, params.sessionId);
    if (!session) {
      return;
    }

    const [messages, linkedAgents, pendingTasks] = await Promise.all([
      app.services.repository.listChatMessages(params.sessionId),
      app.services.repository.listLinkedAgents(params.sessionId),
      app.services.repository.listPendingAgentTasks(params.sessionId),
    ]);

    return chatSessionStateSchema.parse({
      session: {
        id: session.id,
        displayName: session.displayName,
        createdAt: session.createdAt,
      },
      messages,
      linkedAgents,
      pendingTasks,
    });
  });

  app.get("/v1/chat/sessions/:sessionId/tasks/:taskId", async (request, reply) => {
    const params = request.params as { sessionId: string; taskId: string };
    const session = await requireSession(request, reply, params.sessionId);
    if (!session) {
      return;
    }

    const task = await app.services.repository.getAgentTaskForSession(params.sessionId, params.taskId);
    if (!task) {
      return reply.notFound("Agent task not found.");
    }

    return task;
  });

  app.post("/v1/chat/sessions/:sessionId/messages", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const body = chatMessageRequestSchema.parse(request.body);
    const session = await requireSession(request, reply, params.sessionId);

    if (!session) {
      return;
    }

    const alreadySeen = await app.services.repository.hasClientMessage(
      params.sessionId,
      body.clientMessageId,
    );
    if (alreadySeen) {
      return reply.conflict("Duplicate clientMessageId for this session.");
    }

    const memory = body.enableMemory
      ? await app.services.memory.searchForScope({
          query: body.content,
          scope: session.id,
          limit: 5,
        })
      : null;

    if (body.enableMemory) {
      app.services.metrics.markMemoryLookup(
        memory === null ? "error" : memory.results.length ? "hit" : "miss",
      );
    }

    await app.services.repository.saveMessage({
      sessionId: params.sessionId,
      role: "user",
      content: body.content,
      clientMessageId: body.clientMessageId,
      memoryContext: memory,
    });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.hijack();

    try {
      const readyAgent = await app.services.repository.getReadyAgentForSession(params.sessionId);

      writeSse(reply.raw, "session", {
        sessionId: params.sessionId,
        requestId: request.id,
        memoryHits: memory?.results.length ?? 0,
        linkedAgentId: readyAgent?.id ?? null,
      });

      if (!app.services.planner.isConfigured()) {
        await streamModelAnswer({
          app,
          reply,
          request,
          sessionId: params.sessionId,
          prompt: body.content,
          previousResponseId: session.previousResponseId,
          sessionDisplayName: session.displayName,
          memory,
        });
        return;
      }

      const planned = await app.services.planner.planTurn({
        prompt: body.content,
        previousResponseId: session.previousResponseId,
        memoryContext: memory,
        sessionDisplayName: session.displayName,
        linkedAgent: readyAgent,
      });

      if (planned.plan.mode === "local_task") {
        const assistantMessage = await app.services.repository.saveMessage({
          sessionId: params.sessionId,
          role: "assistant",
          content: renderQueuedAgentTaskMessage({
            title: planned.plan.title,
            summary: planned.plan.summary,
            command: planned.plan.command,
            ...(planned.plan.workingDirectory !== undefined
              ? { workingDirectory: planned.plan.workingDirectory }
              : {}),
          }),
          openAiResponseId: planned.responseId,
        });

        await app.services.repository.updateSessionResponseId(params.sessionId, planned.responseId);

        const taskInput = {
          sessionId: params.sessionId,
          agentId: readyAgent?.id ?? "",
          assistantMessageId: assistantMessage.id,
          title: planned.plan.title,
          summary: planned.plan.summary,
          command: planned.plan.command,
          timeoutSeconds: planned.plan.timeoutSeconds,
          shell: planned.plan.shell,
          ...(planned.plan.workingDirectory !== undefined
            ? { workingDirectory: planned.plan.workingDirectory }
            : {}),
        };

        const task = await app.services.repository.createAgentTask(taskInput);

        app.services.metrics.markAgentTask("queued");

        writeSse(reply.raw, "task_queued", {
          message: assistantMessage,
          task,
          previousResponseId: planned.responseId,
        });
        return;
      }

      const assistantText = planned.plan.assistantText.trim();
      for (const chunk of chunkText(assistantText, 42)) {
        writeSse(reply.raw, "delta", { delta: chunk });
      }

      const assistantMessage = await app.services.repository.saveMessage({
        sessionId: params.sessionId,
        role: "assistant",
        content: assistantText,
        openAiResponseId: planned.responseId,
      });

      await app.services.repository.updateSessionResponseId(params.sessionId, planned.responseId);

      writeSse(reply.raw, "complete", {
        message: assistantMessage,
        previousResponseId: planned.responseId,
      });

      void app.services.knowledge
        .captureSuccessfulTurn({
          sessionId: params.sessionId,
          assistantMessageId: assistantMessage.id,
          userPrompt: body.content,
          assistantContent: assistantText,
        })
        .catch((knowledgeError) => {
          request.log.warn({ err: knowledgeError }, "knowledge auto-promotion capture failed");
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected chat failure.";
      writeSse(reply.raw, "error", { message });
    } finally {
      reply.raw.end();
    }
  });
};

async function streamModelAnswer(input: {
  app: FastifyRequest["server"];
  reply: FastifyReply;
  request: FastifyRequest;
  sessionId: string;
  prompt: string;
  previousResponseId: string | null;
  sessionDisplayName: string;
  memory: {
    query: string;
    results: Array<{
      text: string;
      wing: string;
      room: string;
      sourceFile: string;
      similarity: number;
    }>;
  } | null;
}): Promise<void> {
  let assistantText = "";
  let responseId = "";

  for await (const event of input.app.services.chat.streamResponse({
    prompt: input.prompt,
    previousResponseId: input.previousResponseId,
    memoryContext: input.memory,
    sessionDisplayName: input.sessionDisplayName,
  })) {
    if (event.type === "delta") {
      assistantText += event.delta;
      writeSse(input.reply.raw, "delta", { delta: event.delta });
      continue;
    }

    assistantText = event.outputText;
    responseId = event.responseId;
  }

  const assistantMessage = await input.app.services.repository.saveMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: assistantText,
    openAiResponseId: responseId,
  });

  await input.app.services.repository.updateSessionResponseId(input.sessionId, responseId);

  writeSse(input.reply.raw, "complete", {
    message: assistantMessage,
    previousResponseId: responseId,
  });

  void input.app.services.knowledge
    .captureSuccessfulTurn({
      sessionId: input.sessionId,
      assistantMessageId: assistantMessage.id,
      userPrompt: input.prompt,
      assistantContent: assistantText,
    })
    .catch((knowledgeError) => {
      input.request.log.warn({ err: knowledgeError }, "knowledge auto-promotion capture failed");
    });
}

async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
  sessionId: string,
): Promise<
  | {
      id: string;
      displayName: string;
      createdAt: string;
      previousResponseId: string | null;
    }
  | undefined
> {
  const token = sessionTokenHeader(request);
  if (!token) {
    void reply.unauthorized("Missing x-session-token.");
    return undefined;
  }

  const session = await request.server.services.repository.getChatSessionForAccess(sessionId, token);
  if (!session) {
    void reply.unauthorized("Invalid chat session token.");
    return undefined;
  }

  return session;
}

function sessionTokenHeader(request: FastifyRequest): string | null {
  const header = request.headers["x-session-token"];
  return typeof header === "string" && header.trim() ? header.trim() : null;
}

function writeSse(stream: NodeJS.WritableStream, event: string, payload: unknown): void {
  stream.write(`event: ${event}\n`);
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function* chunkText(text: string, size: number): Generator<string> {
  for (let index = 0; index < text.length; index += size) {
    yield text.slice(index, index + size);
  }
}

export function renderTaskCompletionEvent(input: {
  title: string;
  summary: string;
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  command: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  startedAt: string;
  finishedAt: string;
  workingDirectory?: string | null;
}): string {
  return renderCompletedAgentTaskMessage(input);
}

import type { FastifyPluginAsync } from "fastify";

import { chatMessageRequestSchema, chatSessionCreateSchema } from "@4-2/contracts";

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/chat/sessions", async (request, reply) => {
    const input = chatSessionCreateSchema.parse(request.body);
    const session = await app.services.repository.createChatSession(input);
    reply.code(201);
    return session;
  });

  app.post("/v1/chat/sessions/:sessionId/messages", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const body = chatMessageRequestSchema.parse(request.body);
    const session = await app.services.repository.getChatSession(params.sessionId);

    if (!session) {
      return reply.notFound("Chat session not found.");
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

    writeSse(reply.raw, "session", {
      sessionId: params.sessionId,
      requestId: request.id,
      memoryHits: memory?.results.length ?? 0,
    });

    try {
      let assistantText = "";
      let responseId = "";

      for await (const event of app.services.chat.streamResponse({
        prompt: body.content,
        previousResponseId: session.previousResponseId,
        memoryContext: memory,
        sessionDisplayName: session.displayName,
      })) {
        if (event.type === "delta") {
          assistantText += event.delta;
          writeSse(reply.raw, "delta", { delta: event.delta });
          continue;
        }

        assistantText = event.outputText;
        responseId = event.responseId;
      }

      const assistantMessage = await app.services.repository.saveMessage({
        sessionId: params.sessionId,
        role: "assistant",
        content: assistantText,
        openAiResponseId: responseId,
      });

      await app.services.repository.updateSessionResponseId(params.sessionId, responseId);

      writeSse(reply.raw, "complete", {
        message: assistantMessage,
        previousResponseId: responseId,
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

function writeSse(stream: NodeJS.WritableStream, event: string, payload: unknown): void {
  stream.write(`event: ${event}\n`);
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

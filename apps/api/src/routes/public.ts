import type { FastifyPluginAsync } from "fastify";

export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/public/config", async () => {
    return {
      siteName: "4-2.рф",
      apiBaseUrl: app.env.API_PUBLIC_BASE_URL,
      chatEnabled: true,
      installersEnabled: true,
      memoryEnabled: true,
      supportedPlatforms: ["windows", "macos", "linux"],
    };
  });

  app.get("/v1/chat/sessions/:sessionId", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const session = await app.services.repository.getChatSession(params.sessionId);
    if (!session) {
      return reply.notFound("Chat session not found.");
    }

    const messages = await app.services.repository.listChatMessages(params.sessionId);
    return {
      session,
      messages,
    };
  });
};

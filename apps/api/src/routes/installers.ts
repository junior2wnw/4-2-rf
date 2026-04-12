import type { FastifyPluginAsync } from "fastify";

import { installTokenRequestSchema } from "@4-2/contracts";

export const installerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/installers/manifest", async () => {
    return app.services.downloads.loadManifest();
  });

  app.get("/v1/installers/:filename", async (request, reply) => {
    const params = request.params as { filename: string };
    const artifact = await app.services.downloads.readArtifact(params.filename);

    if (!artifact) {
      return reply.notFound("Installer artifact not found.");
    }

    reply.header("content-type", artifact.contentType);
    reply.header("content-disposition", `attachment; filename="${params.filename}"`);
    return artifact.content;
  });

  app.post("/v1/installers/enrollment-token", async (request, reply) => {
    const body = installTokenRequestSchema.parse(request.body);

    if (body.sessionId) {
      const header = request.headers["x-session-token"];
      const sessionToken = typeof header === "string" && header.trim() ? header.trim() : null;

      if (!sessionToken) {
        return reply.unauthorized("Missing x-session-token.");
      }

      const session = await app.services.repository.getChatSessionForAccess(body.sessionId, sessionToken);
      if (!session) {
        return reply.unauthorized("Invalid chat session token.");
      }
    }

    const token = await app.services.repository.createInstallToken(body);
    reply.code(201);
    return token;
  });
};

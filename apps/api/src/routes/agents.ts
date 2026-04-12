import type { FastifyPluginAsync } from "fastify";

import { agentRegisterSchema, heartbeatSchema } from "@4-2/contracts";

export const agentRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/agents/register", async (request, reply) => {
    const body = agentRegisterSchema.parse(request.body);

    try {
      const registration = await app.services.repository.createAgentRegistration(body);
      reply.code(201);
      return {
        agentId: registration.agentId,
        heartbeatIntervalSeconds: 30,
        heartbeatToken: registration.heartbeatToken,
      };
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Registration failed.");
    }
  });

  app.post("/v1/agents/heartbeat", async (request, reply) => {
    const body = heartbeatSchema.parse(request.body);
    const accepted = await app.services.repository.recordHeartbeat(body);

    if (!accepted) {
      app.services.metrics.markAgentHeartbeat("rejected");
      return reply.unauthorized("Invalid agent heartbeat token.");
    }

    app.services.metrics.markAgentHeartbeat(body.status);
    return {
      ok: true,
      now: new Date().toISOString(),
    };
  });
};

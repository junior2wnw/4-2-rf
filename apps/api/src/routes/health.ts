import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/healthz", async () => {
    const plannerStatus = await app.services.planner.getRuntimeStatus();
    return {
      status: "ok",
      service: "api",
      now: new Date().toISOString(),
      liveModel: plannerStatus === "live",
      runtimeStatus: plannerStatus,
    };
  });

  app.get("/readyz", async (_request, reply) => {
    const checks = {
      db: false,
      memory: false,
    };

    try {
      await app.services.repository.ping();
      checks.db = true;
    } catch {}

    checks.memory = await app.services.memory.healthcheck();

    const ready = Object.values(checks).every(Boolean);
    reply.code(ready ? 200 : 503);

    return {
      status: ready ? "ready" : "degraded",
      checks,
      now: new Date().toISOString(),
    };
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", app.services.metrics.contentType());
    return app.services.metrics.render();
  });
};

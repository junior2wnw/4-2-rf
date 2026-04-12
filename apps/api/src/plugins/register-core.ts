import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import type { FastifyInstance } from "fastify";

import type { AppEnv } from "../config/env.js";
import type { MetricsService } from "../services/metrics-service.js";

export async function registerCorePlugins(
  app: FastifyInstance,
  env: AppEnv,
  metrics: MetricsService,
): Promise<void> {
  await app.register(sensible);
  await app.register(cors, {
    origin: [env.WEB_PUBLIC_BASE_URL, env.API_PUBLIC_BASE_URL],
    credentials: false,
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    allowList: ["127.0.0.1"],
  });

  app.addHook("onRequest", async (request) => {
    request.raw.setTimeout(env.OPENAI_TIMEOUT_MS + 5_000);
    request.headers["x-request-id"] ??= request.id;
    request.log = request.log.child({ requestId: request.id });
    request.startTime = Date.now();
  });

  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url || request.url;
    const startedAt = request.startTime ?? Date.now();
    metrics.observeHttp({
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
}

declare module "fastify" {
  interface FastifyRequest {
    startTime?: number;
  }
}

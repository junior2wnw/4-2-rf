import Fastify, { type FastifyInstance } from "fastify";

import type { AppEnv } from "./config/env.js";
import { registerCorePlugins } from "./plugins/register-core.js";
import { agentRoutes } from "./routes/agents.js";
import { chatRoutes } from "./routes/chat.js";
import { healthRoutes } from "./routes/health.js";
import { installerRoutes } from "./routes/installers.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { publicRoutes } from "./routes/public.js";
import type { ChatService } from "./services/chat-service.js";
import type { DownloadService } from "./services/download-service.js";
import type { ExecutionPlannerService } from "./services/execution-planner-service.js";
import type { KnowledgeService } from "./services/knowledge-service.js";
import type { MemoryService } from "./services/memory-service.js";
import type { MetricsService } from "./services/metrics-service.js";
import type { Repository } from "./services/repository.js";

export type AppServices = {
  chat: ChatService;
  downloads: DownloadService;
  planner: ExecutionPlannerService;
  knowledge: KnowledgeService;
  memory: MemoryService;
  metrics: MetricsService;
  repository: Repository;
};

export async function buildApp(input: {
  env: AppEnv;
  services: AppServices;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: input.env.LOG_LEVEL,
    },
    disableRequestLogging: false,
    requestIdHeader: "x-request-id",
  });

  app.decorate("env", input.env);
  app.decorate("services", input.services);

  await registerCorePlugins(app, input.env, input.services.metrics);

  await app.register(healthRoutes);
  await app.register(publicRoutes);
  await app.register(chatRoutes);
  await app.register(agentRoutes);
  await app.register(installerRoutes);
  await app.register(knowledgeRoutes);

  app.setErrorHandler((error, request, reply) => {
    const message = error instanceof Error ? error.message : "Unknown internal error";
    const name = error instanceof Error ? error.name : "Error";
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode ?? 500)
        : 500;

    request.log.error({ err: error }, "request failed");
    reply.status(statusCode).send({
      error: name,
      message,
      requestId: request.id,
    });
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    env: AppEnv;
    services: AppServices;
  }
}

import { Pool } from "pg";

import { buildApp } from "./app.js";
import { parseEnv } from "./config/env.js";
import { runMigrations } from "./db/migrator.js";
import { ChatService } from "./services/chat-service.js";
import { DownloadService } from "./services/download-service.js";
import { KnowledgeService } from "./services/knowledge-service.js";
import { MemoryService } from "./services/memory-service.js";
import { MetricsService } from "./services/metrics-service.js";
import { Repository } from "./services/repository.js";

async function main(): Promise<void> {
  const env = parseEnv(process.env);
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === "production" ? 30 : 10,
    idleTimeoutMillis: 30_000,
  });

  await runMigrations(pool);

  const metrics = new MetricsService();
  const repository = new Repository(pool);
  const memory = new MemoryService(
    env.MEMORY_SIDECAR_URL,
    env.MEMORY_SIDECAR_API_KEY,
    env.MEMORY_SIDECAR_TIMEOUT_MS,
  );
  const downloads = new DownloadService(
    env.AGENT_ARTIFACTS_DIR,
    env.INSTALLER_BASE_URL,
    env.API_PUBLIC_BASE_URL,
  );
  const chat = new ChatService(env, metrics);
  const knowledge = new KnowledgeService(repository, metrics);

  const app = await buildApp({
    env,
    services: {
      chat,
      downloads,
      knowledge,
      memory,
      metrics,
      repository,
    },
  });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  await app.listen({
    host: env.API_HOST,
    port: env.API_PORT,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { resolve } from "node:path";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  API_HOST: z.string().trim().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  API_PUBLIC_BASE_URL: z.url().default("http://localhost:8080"),
  WEB_PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5"),
  OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).default("medium"),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(8192).default(1200),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
  DATABASE_URL: z.string().trim().min(1).default("postgres://fourtwo:fourtwo@localhost:5432/fourtwo"),
  MEMORY_SIDECAR_URL: z.url().default("http://localhost:8090"),
  MEMORY_SIDECAR_API_KEY: z.string().trim().min(16).default("local-memory-sidecar-key"),
  AGENT_ENROLLMENT_SECRET: z.string().trim().min(16).default("local-dev-secret-rotate-me"),
  AGENT_ARTIFACTS_DIR: z.string().trim().default(resolve(process.cwd(), "../agent/dist")),
  INSTALLER_BASE_URL: z.url().default("http://localhost:8080/v1/installers"),
  KNOWLEDGE_ADMIN_API_KEY: z.string().trim().min(16).default("local-admin-api-key"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(5000).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600_000).default(60_000),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse(input);
}

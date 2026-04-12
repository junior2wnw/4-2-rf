import { z } from "zod";

export const platformSchema = z.enum(["windows", "macos", "linux"]);
export const archSchema = z.enum(["amd64", "arm64"]);
export const installScopeSchema = z.enum(["user", "system"]);

export const chatSessionCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  platform: platformSchema.optional(),
  arch: archSchema.optional(),
  userAgent: z.string().trim().max(500).optional(),
});

export const chatSessionSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  createdAt: z.string().datetime(),
});

export const chatSessionCreateResponseSchema = chatSessionSchema.extend({
  accessToken: z.string().min(24).max(128),
});

export const chatMessageRequestSchema = z.object({
  clientMessageId: z.string().trim().min(8).max(128),
  content: z.string().trim().min(1).max(12_000),
  enableMemory: z.boolean().default(true),
});

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export const publicConfigSchema = z.object({
  siteName: z.literal("4-2.рф"),
  apiBaseUrl: z.string().url(),
  chatEnabled: z.boolean(),
  installersEnabled: z.boolean(),
  memoryEnabled: z.boolean(),
  supportedPlatforms: z.array(platformSchema),
});

export const downloadManifestItemSchema = z.object({
  platform: platformSchema,
  arch: archSchema,
  filename: z.string(),
  installCommand: z.string(),
  sha256: z.string().min(64).max(64).optional(),
  url: z.string().url(),
  notes: z.array(z.string()),
});

export const downloadManifestSchema = z.object({
  generatedAt: z.string().datetime(),
  items: z.array(downloadManifestItemSchema),
});

export const installTokenRequestSchema = z.object({
  platform: platformSchema,
  arch: archSchema,
  scope: installScopeSchema.default("user"),
  requestedBy: z.string().trim().min(1).max(120),
  sessionId: z.string().uuid().optional(),
});

export const installTokenResponseSchema = z.object({
  token: z.string().min(24),
  expiresAt: z.string().datetime(),
});

export const agentRegisterSchema = z.object({
  enrollmentToken: z.string().min(24),
  hostname: z.string().trim().min(1).max(255),
  platform: platformSchema,
  arch: archSchema,
  scope: installScopeSchema,
  agentVersion: z.string().trim().min(1).max(64),
  osVersion: z.string().trim().min(1).max(255),
});

export const agentRegistrationResponseSchema = z.object({
  agentId: z.string().uuid(),
  heartbeatIntervalSeconds: z.number().int().positive(),
  heartbeatToken: z.string().min(24),
});

export const heartbeatSchema = z.object({
  agentId: z.string().uuid(),
  heartbeatToken: z.string().min(24),
  status: z.enum(["starting", "ready", "degraded"]),
  installedAt: z.string().datetime(),
});

export const linkedAgentSchema = z.object({
  id: z.string().uuid(),
  hostname: z.string(),
  platform: platformSchema,
  arch: archSchema,
  scope: installScopeSchema,
  status: z.enum(["starting", "ready", "degraded"]),
  agentVersion: z.string(),
  osVersion: z.string(),
  lastSeenAt: z.string().datetime(),
  linkedAt: z.string().datetime(),
  isConnected: z.boolean(),
});

export const agentTaskStateSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
]);

export const agentTaskSchema = z.object({
  id: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
  title: z.string(),
  summary: z.string(),
  status: agentTaskStateSchema,
  exitCode: z.number().int().nullable(),
  stdout: z.string().nullable(),
  stderr: z.string().nullable(),
  assistantContent: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});

export const chatSessionStateSchema = z.object({
  session: chatSessionSchema,
  messages: z.array(chatMessageSchema),
  linkedAgents: z.array(linkedAgentSchema),
  pendingTasks: z.array(agentTaskSchema),
});

export const agentTaskClaimSchema = z.object({
  agentId: z.string().uuid(),
  heartbeatToken: z.string().min(24),
});

export const agentTaskClaimResponseSchema = z.object({
  task: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
      summary: z.string(),
      command: z.string(),
      workingDirectory: z.string().nullable(),
      timeoutSeconds: z.number().int().min(5).max(900),
      shell: z.enum(["powershell", "sh"]),
    })
    .nullable(),
});

export const agentTaskCompleteSchema = z.object({
  agentId: z.string().uuid(),
  heartbeatToken: z.string().min(24),
  status: z.enum(["succeeded", "failed", "timed_out", "cancelled"]),
  exitCode: z.number().int().nullable(),
  stdout: z.string().max(128_000).nullable(),
  stderr: z.string().max(128_000).nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
});

export const memorySearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(1000),
  limit: z.number().int().min(1).max(10).default(5),
  wing: z.string().trim().max(128).optional(),
  room: z.string().trim().max(128).optional(),
});

export const memorySearchResultSchema = z.object({
  text: z.string(),
  wing: z.string(),
  room: z.string(),
  sourceFile: z.string(),
  similarity: z.number(),
});

export const memorySearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(memorySearchResultSchema),
});

export const knowledgePromotionStatusSchema = z.enum(["pending", "published", "rejected"]);

export const knowledgePromotionCreateSchema = z.object({
  title: z.string().trim().min(4).max(160),
  summary: z.string().trim().min(8).max(1000),
  content: z.string().trim().min(16).max(16_000),
  tags: z.array(z.string().trim().min(1).max(64)).max(16).default([]),
  sourceSessionId: z.string().uuid().optional(),
  sourceMessageId: z.string().uuid().optional(),
  createdBy: z.string().trim().min(1).max(120),
  scopeWing: z.string().trim().min(1).max(128).default("public-playbooks"),
  scopeRoom: z.string().trim().min(1).max(128).default("playbooks"),
});

export const knowledgePromotionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  summary: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  sourceSessionId: z.string().uuid().nullable(),
  sourceMessageId: z.string().uuid().nullable(),
  scopeWing: z.string(),
  scopeRoom: z.string(),
  status: knowledgePromotionStatusSchema,
  createdBy: z.string(),
  publishedDrawerId: z.string().nullable(),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
});

export const knowledgePromotionListQuerySchema = z.object({
  status: knowledgePromotionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const knowledgePromotionListResponseSchema = z.object({
  items: z.array(knowledgePromotionSchema),
});

export type ChatSessionCreate = z.infer<typeof chatSessionCreateSchema>;
export type ChatSession = z.infer<typeof chatSessionSchema>;
export type ChatSessionCreateResponse = z.infer<typeof chatSessionCreateResponseSchema>;
export type ChatMessageRequest = z.infer<typeof chatMessageRequestSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type PublicConfig = z.infer<typeof publicConfigSchema>;
export type DownloadManifest = z.infer<typeof downloadManifestSchema>;
export type DownloadManifestItem = z.infer<typeof downloadManifestItemSchema>;
export type InstallTokenRequest = z.infer<typeof installTokenRequestSchema>;
export type InstallTokenResponse = z.infer<typeof installTokenResponseSchema>;
export type AgentRegister = z.infer<typeof agentRegisterSchema>;
export type AgentRegistrationResponse = z.infer<typeof agentRegistrationResponseSchema>;
export type HeartbeatPayload = z.infer<typeof heartbeatSchema>;
export type LinkedAgent = z.infer<typeof linkedAgentSchema>;
export type AgentTask = z.infer<typeof agentTaskSchema>;
export type ChatSessionState = z.infer<typeof chatSessionStateSchema>;
export type AgentTaskClaim = z.infer<typeof agentTaskClaimSchema>;
export type AgentTaskClaimResponse = z.infer<typeof agentTaskClaimResponseSchema>;
export type AgentTaskComplete = z.infer<typeof agentTaskCompleteSchema>;
export type MemorySearchRequest = z.infer<typeof memorySearchRequestSchema>;
export type MemorySearchResponse = z.infer<typeof memorySearchResponseSchema>;
export type KnowledgePromotionCreate = z.infer<typeof knowledgePromotionCreateSchema>;
export type KnowledgePromotion = z.infer<typeof knowledgePromotionSchema>;
export type KnowledgePromotionListQuery = z.infer<typeof knowledgePromotionListQuerySchema>;

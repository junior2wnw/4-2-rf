import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export class MetricsService {
  private readonly registry = new Registry();

  private readonly httpDuration = new Histogram({
    name: "four_two_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  private readonly openAiDuration = new Histogram({
    name: "four_two_openai_request_duration_seconds",
    help: "OpenAI request duration in seconds",
    labelNames: ["mode", "status"] as const,
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 60],
    registers: [this.registry],
  });

  private readonly memoryLookups = new Counter({
    name: "four_two_memory_lookups_total",
    help: "Memory lookup attempts",
    labelNames: ["status"] as const,
    registers: [this.registry],
  });

  private readonly agentHeartbeats = new Counter({
    name: "four_two_agent_heartbeats_total",
    help: "Agent heartbeat count",
    labelNames: ["status"] as const,
    registers: [this.registry],
  });

  private readonly knowledgePromotions = new Counter({
    name: "four_two_knowledge_promotions_total",
    help: "Knowledge promotion pipeline events",
    labelNames: ["status"] as const,
    registers: [this.registry],
  });

  public constructor() {
    collectDefaultMetrics({
      prefix: "four_two_",
      register: this.registry,
    });
  }

  public observeHttp(input: { method: string; route: string; statusCode: number; durationMs: number }): void {
    this.httpDuration.labels(input.method, input.route, String(input.statusCode)).observe(input.durationMs / 1000);
  }

  public observeOpenAi(input: { mode: "stream" | "mock"; status: "ok" | "error"; durationMs: number }): void {
    this.openAiDuration.labels(input.mode, input.status).observe(input.durationMs / 1000);
  }

  public markMemoryLookup(status: "hit" | "miss" | "error"): void {
    this.memoryLookups.labels(status).inc();
  }

  public markAgentHeartbeat(status: "starting" | "ready" | "degraded" | "rejected"): void {
    this.agentHeartbeats.labels(status).inc();
  }

  public markKnowledgePromotion(
    status: "auto_created" | "manual_created" | "duplicate" | "published" | "rejected" | "skipped",
  ): void {
    this.knowledgePromotions.labels(status).inc();
  }

  public async render(): Promise<string> {
    return this.registry.metrics();
  }

  public contentType(): string {
    return this.registry.contentType;
  }
}

import { describe, expect, it, vi } from "vitest";

import { KnowledgeService } from "../src/services/knowledge-service.js";

describe("KnowledgeService", () => {
  it("creates a candidate for structured reusable assistant output", async () => {
    const repository = {
      createKnowledgePromotion: vi.fn().mockResolvedValue({
        created: true,
        item: { id: "ignored" },
      }),
    };
    const metrics = {
      markKnowledgePromotion: vi.fn(),
    };

    const service = new KnowledgeService(repository as never, metrics as never);

    const result = await service.captureSuccessfulTurn({
      sessionId: "9b38596d-e06d-4d46-a90b-a29d2646eef3",
      assistantMessageId: "ed7f7f8e-8d1f-48bb-bab8-0e67c49eaef1",
      userPrompt: "Сделай production-ready deploy plan для AI сервиса с rollback и healthchecks",
      assistantContent: `
1. Prepare infra
- Provision PostgreSQL
- Configure health checks

2. Deploy
- Ship web and API separately
- Add rollback checklist

3. Validate
- Smoke test the routes
- Verify metrics and traces
      `.repeat(8),
    });

    expect(result).toEqual({
      created: true,
      skipped: false,
      reason: undefined,
    });
    expect(repository.createKnowledgePromotion).toHaveBeenCalledOnce();
    expect(metrics.markKnowledgePromotion).toHaveBeenCalledWith("auto_created");
  });

  it("skips candidate extraction when sensitive data is present", async () => {
    const repository = {
      createKnowledgePromotion: vi.fn(),
    };
    const metrics = {
      markKnowledgePromotion: vi.fn(),
    };

    const service = new KnowledgeService(repository as never, metrics as never);

    const result = await service.captureSuccessfulTurn({
      sessionId: "9b38596d-e06d-4d46-a90b-a29d2646eef3",
      assistantMessageId: "ed7f7f8e-8d1f-48bb-bab8-0e67c49eaef1",
      userPrompt: "Разбери этот доступ",
      assistantContent:
        "Вот ключ sk_super_secret_long_value_123456789012345 и путь C:\\Users\\Admin\\Secrets. " +
        "1. Step one\n2. Step two\n".repeat(15),
    });

    expect(result.skipped).toBe(true);
    expect(repository.createKnowledgePromotion).not.toHaveBeenCalled();
    expect(metrics.markKnowledgePromotion).toHaveBeenCalledWith("skipped");
  });
});

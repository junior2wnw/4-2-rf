import { timingSafeEqual } from "node:crypto";

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import {
  knowledgePromotionCreateSchema,
  knowledgePromotionListQuerySchema,
} from "@4-2/contracts";

export const knowledgeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/knowledge/promotions", async (request, reply) => {
    if (!authorizeAdmin(app.env.KNOWLEDGE_ADMIN_API_KEY, request, reply)) {
      return;
    }

    const query = knowledgePromotionListQuerySchema.parse(request.query ?? {});
    return {
      items: await app.services.repository.listKnowledgePromotions(query),
    };
  });

  app.post("/v1/knowledge/promotions", async (request, reply) => {
    if (!authorizeAdmin(app.env.KNOWLEDGE_ADMIN_API_KEY, request, reply)) {
      return;
    }

    const body = knowledgePromotionCreateSchema.parse(request.body);
    const result = await app.services.repository.createKnowledgePromotion(body);
    app.services.metrics.markKnowledgePromotion(result.created ? "manual_created" : "duplicate");
    reply.code(result.created ? 201 : 200);
    return result;
  });

  app.post("/v1/knowledge/promotions/:promotionId/publish", async (request, reply) => {
    if (!authorizeAdmin(app.env.KNOWLEDGE_ADMIN_API_KEY, request, reply)) {
      return;
    }

    const params = request.params as { promotionId: string };
    const promotion = await app.services.repository.getKnowledgePromotion(params.promotionId);

    if (!promotion) {
      return reply.notFound("Knowledge promotion not found.");
    }

    if (promotion.status === "rejected") {
      return reply.conflict("Rejected knowledge promotion cannot be published.");
    }

    if (promotion.status === "published") {
      return promotion;
    }

    const drawer = await app.services.memory.storeDrawer({
      text: buildSharedPlaybook(promotion),
      wing: promotion.scopeWing,
      room: promotion.scopeRoom,
      sourceFile: `promotion://${promotion.id}`,
    });

    if (!drawer?.stored) {
      return reply.serviceUnavailable("Memory sidecar did not acknowledge knowledge publish.");
    }

    const published = await app.services.repository.publishKnowledgePromotion({
      id: promotion.id,
      publishedDrawerId: drawer.id,
    });

    if (!published) {
      return reply.internalServerError(
        "Knowledge publish persisted in memory but failed in the control-plane database.",
      );
    }

    app.services.metrics.markKnowledgePromotion("published");
    return published;
  });

  app.post("/v1/knowledge/promotions/:promotionId/reject", async (request, reply) => {
    if (!authorizeAdmin(app.env.KNOWLEDGE_ADMIN_API_KEY, request, reply)) {
      return;
    }

    const params = request.params as { promotionId: string };
    const promotion = await app.services.repository.getKnowledgePromotion(params.promotionId);

    if (!promotion) {
      return reply.notFound("Knowledge promotion not found.");
    }

    if (promotion.status === "published") {
      return reply.conflict("Published knowledge promotion cannot be rejected.");
    }

    if (promotion.status === "rejected") {
      return promotion;
    }

    const rejected = await app.services.repository.rejectKnowledgePromotion(params.promotionId);

    if (!rejected) {
      return reply.internalServerError("Knowledge rejection failed to persist.");
    }

    app.services.metrics.markKnowledgePromotion("rejected");
    return rejected;
  });
};

function authorizeAdmin(
  expectedKey: string,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const provided = request.headers["x-admin-api-key"];
  const providedKey = Array.isArray(provided) ? provided[0] : provided;

  if (!providedKey || !timingSafeStringEqual(providedKey, expectedKey)) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Missing or invalid admin API key.",
      requestId: request.id,
    });
    return false;
  }

  return true;
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function buildSharedPlaybook(input: {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
}): string {
  const sections = [
    `Title: ${input.title}`,
    `Summary: ${input.summary}`,
    "Reusable playbook:",
    input.content,
  ];

  if (input.tags.length) {
    sections.push(`Tags: ${input.tags.join(", ")}`);
  }

  sections.push(`Source promotion: ${input.id}`);
  return sections.join("\n\n");
}

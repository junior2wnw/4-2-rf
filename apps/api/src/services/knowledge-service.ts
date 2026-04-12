import type { KnowledgePromotionCreate } from "@4-2/contracts";

import type { MetricsService } from "./metrics-service.js";
import type { Repository } from "./repository.js";

const SENSITIVE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:sk|rk|pk|ghp|ghu|ghs|pat)_[A-Za-z0-9_\-]{12,}\b/g,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+/=]+\b/gi,
  /\b[A-Z]:\\[^\s]+/g,
  /\/(?:home|Users|var|etc|opt)\/[^\s]+/g,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,
];

const STRUCTURE_PATTERNS = [
  /^\d+\.\s/m,
  /^-\s/m,
  /^##?\s/m,
  /rollback/gi,
  /runbook/gi,
  /checklist/gi,
  /architecture/gi,
  /security/gi,
  /metrics/gi,
  /deploy/gi,
  /oncall/gi,
  /observability/gi,
];

const TAGS = [
  "growth",
  "security",
  "deploy",
  "rollback",
  "observability",
  "memory",
  "agent",
  "architecture",
  "product",
  "onboarding",
  "cli",
  "chat",
];

export class KnowledgeService {
  public constructor(
    private readonly repository: Repository,
    private readonly metrics: MetricsService,
  ) {}

  public async captureSuccessfulTurn(input: {
    sessionId: string;
    assistantMessageId: string;
    userPrompt: string;
    assistantContent: string;
    createdBy?: string;
  }): Promise<{ created: boolean; skipped: boolean; reason?: string }> {
    const candidate = deriveKnowledgePromotion(input);

    if (!candidate) {
      this.metrics.markKnowledgePromotion("skipped");
      return { created: false, skipped: true, reason: "did_not_meet_capture_policy" };
    }

    const result = await this.repository.createKnowledgePromotion(candidate);
    this.metrics.markKnowledgePromotion(result.created ? "auto_created" : "duplicate");

    return {
      created: result.created,
      skipped: false,
      ...(result.created ? {} : { reason: "duplicate" }),
    };
  }
}

function deriveKnowledgePromotion(input: {
  sessionId: string;
  assistantMessageId: string;
  userPrompt: string;
  assistantContent: string;
  createdBy?: string;
}): KnowledgePromotionCreate | null {
  const userPrompt = sanitizeText(input.userPrompt);
  const assistantContent = sanitizeText(input.assistantContent);

  if (assistantContent.length < 300 || assistantContent.length > 16_000) {
    return null;
  }

  if (containsSensitiveSignals(input.userPrompt) || containsSensitiveSignals(input.assistantContent)) {
    return null;
  }

  if (!looksReusable(userPrompt, assistantContent)) {
    return null;
  }

  return {
    title: buildTitle(userPrompt),
    summary: buildSummary(userPrompt, assistantContent),
    content: assistantContent,
    tags: inferTags(userPrompt, assistantContent),
    sourceSessionId: input.sessionId,
    sourceMessageId: input.assistantMessageId,
    createdBy: input.createdBy ?? "system:auto-extract",
    scopeWing: "public-playbooks",
    scopeRoom: "playbooks",
  };
}

function containsSensitiveSignals(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function looksReusable(userPrompt: string, assistantContent: string): boolean {
  const structured = STRUCTURE_PATTERNS.some((pattern) => pattern.test(assistantContent));
  const intentSignals = /(plan|strategy|architecture|deploy|security|growth|runbook|checklist|playbook)/i.test(
    `${userPrompt}\n${assistantContent}`,
  );
  return structured || intentSignals;
}

function buildTitle(userPrompt: string): string {
  const trimmed = collapseWhitespace(userPrompt);
  const base = trimmed.length > 110 ? `${trimmed.slice(0, 107).trimEnd()}...` : trimmed;
  return `Playbook: ${base}`;
}

function buildSummary(userPrompt: string, assistantContent: string): string {
  const lead = firstParagraph(assistantContent);
  const summary = `Auto-extracted from a successful turn. User intent: ${collapseWhitespace(userPrompt)}. Lead: ${collapseWhitespace(lead)}`;
  return summary.length > 1000 ? `${summary.slice(0, 997).trimEnd()}...` : summary;
}

function inferTags(userPrompt: string, assistantContent: string): string[] {
  const haystack = `${userPrompt}\n${assistantContent}`.toLowerCase();
  const matches = TAGS.filter((tag) => haystack.includes(tag));
  return matches.length ? matches : ["playbook", "auto-extract"];
}

function sanitizeText(text: string): string {
  let sanitized = text;

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  return sanitized.trim().slice(0, 16_000);
}

function firstParagraph(text: string): string {
  const paragraph = text.split(/\n\s*\n/u)[0] ?? text;
  return paragraph.trim();
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

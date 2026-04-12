import OpenAI from "openai";

import type { AppEnv } from "../config/env.js";
import { extractResponseId, extractResponseText } from "../lib/response-utils.js";
import type { MetricsService } from "./metrics-service.js";

type MemoryContext = {
  query: string;
  results: Array<{
    text: string;
    wing: string;
    room: string;
    sourceFile: string;
    similarity: number;
  }>;
} | null;

type StreamDeltaEvent = {
  type: "delta";
  delta: string;
};

type StreamCompletedEvent = {
  type: "completed";
  outputText: string;
  responseId: string;
};

export type ChatStreamEvent = StreamDeltaEvent | StreamCompletedEvent;

export class ChatService {
  private readonly client: OpenAI | null;

  public constructor(
    private readonly env: AppEnv,
    private readonly metrics: MetricsService,
  ) {
    this.client = env.OPENAI_API_KEY
      ? new OpenAI({
          apiKey: env.OPENAI_API_KEY,
          maxRetries: 2,
          timeout: env.OPENAI_TIMEOUT_MS,
        })
      : null;
  }

  public isLiveModelEnabled(): boolean {
    return this.client !== null;
  }

  public async *streamResponse(input: {
    prompt: string;
    previousResponseId: string | null;
    memoryContext: MemoryContext;
    sessionDisplayName: string;
  }): AsyncGenerator<ChatStreamEvent> {
    if (!this.client) {
      yield* this.streamMockResponse(input.prompt, input.memoryContext);
      return;
    }

    const startedAt = performance.now();
    let responseId = "";
    let collected = "";

    try {
      const stream = (await this.client.responses.create({
        model: this.env.OPENAI_MODEL,
        previous_response_id: input.previousResponseId ?? undefined,
        instructions: buildInstructions(input.sessionDisplayName, input.memoryContext),
        input: input.prompt,
        store: true,
        max_output_tokens: this.env.OPENAI_MAX_OUTPUT_TOKENS,
        reasoning: { effort: this.env.OPENAI_REASONING_EFFORT },
        stream: true,
      } as never)) as unknown as AsyncIterable<Record<string, unknown>>;

      for await (const event of stream) {
        const eventType = typeof event.type === "string" ? event.type : "";

        if (eventType === "response.output_text.delta") {
          const delta = typeof event.delta === "string" ? event.delta : "";
          if (delta) {
            collected += delta;
            yield { type: "delta", delta };
          }
          continue;
        }

        if (eventType === "response.output_text.done" && typeof event.text === "string") {
          collected = event.text;
          continue;
        }

        if (eventType === "response.completed") {
          responseId = extractResponseId(event.response) ?? responseId;
          collected = extractResponseText(event.response) || collected;
          continue;
        }

        if (eventType === "error") {
          const message =
            typeof event.message === "string"
              ? event.message
              : "Unknown OpenAI streaming error.";
          throw new Error(message);
        }
      }

      const outputText = collected.trim();
      if (!outputText) {
        throw new Error("The model returned an empty response.");
      }

      if (!responseId) {
        responseId = `resp_fallback_${Date.now()}`;
      }

      this.metrics.observeOpenAi({
        mode: "stream",
        status: "ok",
        durationMs: performance.now() - startedAt,
      });

      yield {
        type: "completed",
        outputText,
        responseId,
      };
    } catch (error) {
      this.metrics.observeOpenAi({
        mode: "stream",
        status: "error",
        durationMs: performance.now() - startedAt,
      });
      throw error;
    }
  }

  private async *streamMockResponse(
    prompt: string,
    memoryContext: MemoryContext,
  ): AsyncGenerator<ChatStreamEvent> {
    const startedAt = performance.now();
    const headline = "Демо-режим активен: backend работает, но `OPENAI_API_KEY` не задан.";
    const memoryNote =
      memoryContext && memoryContext.results.length
        ? ` Нашёл ${memoryContext.results.length} совпадений в памяти и учёл их в ответе.`
        : " Память сейчас не дала релевантных совпадений.";
    const outputText = `${headline}${memoryNote} Запрос: "${prompt}". Для production-поведения добавь ключ OpenAI и перезапусти API.`;

    for (const chunk of chunkText(outputText, 42)) {
      yield { type: "delta", delta: chunk };
    }

    this.metrics.observeOpenAi({
      mode: "mock",
      status: "ok",
      durationMs: performance.now() - startedAt,
    });

    yield {
      type: "completed",
      outputText,
      responseId: `demo_${Date.now()}`,
    };
  }
}

function buildInstructions(sessionDisplayName: string, memoryContext: MemoryContext): string {
  const sections = [
    "You are the 4-2.рф orchestration assistant.",
    "Be concise, decisive, and operationally useful.",
    "Favor concrete next actions over abstract discussion.",
    `Current session label: ${sessionDisplayName}.`,
  ];

  if (memoryContext?.results.length) {
    sections.push("Retrieved memory context:");
    for (const [index, result] of memoryContext.results.entries()) {
      sections.push(
        `${index + 1}. [wing=${result.wing} room=${result.room} source=${result.sourceFile} similarity=${result.similarity}] ${result.text}`,
      );
    }
  } else {
    sections.push("No memory context was retrieved for this turn.");
  }

  sections.push("If memory seems stale or weak, say so instead of pretending certainty.");

  return sections.join("\n");
}

function* chunkText(text: string, size: number): Generator<string> {
  for (let index = 0; index < text.length; index += size) {
    yield text.slice(index, index + size);
  }
}

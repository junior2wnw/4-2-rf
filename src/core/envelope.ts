import { randomId, nowIso } from "../utils/encoding.js";

export type DeliveryMode =
  | "reliable"
  | "ordered"
  | "unordered"
  | "latest_only"
  | "durable"
  | "at_most_once"
  | "at_least_once"
  | "exactly_once";

export interface DeliveryOptions {
  readonly mode: DeliveryMode;
  readonly ack?: boolean;
  readonly resume?: boolean;
  readonly ttlMs?: number;
  readonly idempotencyKey?: string;
}

export interface MessageEnvelope<TPayload = unknown> {
  readonly v: 1;
  readonly msgId: string;
  readonly streamId: string;
  readonly channel: string;
  readonly type: string;
  readonly contentType: string;
  readonly encoding: "json" | "utf8" | "binary" | "base64url";
  readonly delivery: DeliveryOptions;
  readonly meta: Record<string, unknown>;
  readonly payload: TPayload;
  readonly createdAt: string;
}

export interface EnvelopeInput<TPayload> {
  readonly channel: string;
  readonly type: string;
  readonly contentType: string;
  readonly encoding: MessageEnvelope["encoding"];
  readonly payload: TPayload;
  readonly delivery?: Partial<DeliveryOptions> & { mode?: DeliveryMode };
  readonly meta?: Record<string, unknown>;
  readonly streamId?: string;
}

export function createEnvelope<TPayload>(input: EnvelopeInput<TPayload>): MessageEnvelope<TPayload> {
  const envelope: MessageEnvelope<TPayload> = {
    v: 1,
    msgId: randomId("msg"),
    streamId: input.streamId ?? randomId("str"),
    channel: input.channel,
    type: input.type,
    contentType: input.contentType,
    encoding: input.encoding,
    delivery: {
      mode: input.delivery?.mode ?? "reliable",
      ack: input.delivery?.ack ?? true,
      resume: input.delivery?.resume ?? false,
      ...(input.delivery?.ttlMs ? { ttlMs: input.delivery.ttlMs } : {}),
      ...(input.delivery?.idempotencyKey ? { idempotencyKey: input.delivery.idempotencyKey } : {})
    },
    meta: input.meta ?? {},
    payload: input.payload,
    createdAt: nowIso()
  };

  validateEnvelope(envelope);
  return envelope;
}

export function validateEnvelope(envelope: MessageEnvelope): void {
  if (envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${envelope.v}`);
  }
  if (!envelope.msgId || !envelope.streamId) {
    throw new Error("Envelope must include msgId and streamId");
  }
  if (!envelope.channel || !envelope.type) {
    throw new Error("Envelope must include channel and type");
  }
  if (envelope.delivery.mode === "exactly_once" && !envelope.delivery.idempotencyKey) {
    throw new Error("exactly_once delivery requires idempotencyKey");
  }
}

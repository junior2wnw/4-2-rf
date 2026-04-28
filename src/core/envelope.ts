import { fromBase64Url, nowIso, randomId, toBase64Url } from "../utils/encoding.js";

export type DeliveryMode =
  | "reliable"
  | "ordered"
  | "unordered"
  | "latest_only"
  | "durable"
  | "at_most_once"
  | "at_least_once"
  | "exactly_once";

export interface DeliveryPolicy {
  readonly mode: DeliveryMode;
  readonly ack?: boolean;
  readonly resume?: boolean;
  readonly ttlMs?: number;
  readonly idempotencyKey?: string;
}

export interface ByteEnvelope {
  readonly v: 1;
  readonly envelopeId: string;
  readonly streamId: string;
  readonly seq: number;
  readonly contentType: string;
  readonly format: string;
  readonly delivery: DeliveryPolicy;
  readonly meta: Record<string, unknown>;
  readonly payload: string;
  readonly createdAt: string;
}

export interface ByteEnvelopeInput {
  readonly streamId: string;
  readonly seq: number;
  readonly payload: Uint8Array;
  readonly contentType?: string;
  readonly format?: string;
  readonly delivery?: Partial<DeliveryPolicy> & { mode?: DeliveryMode };
  readonly meta?: Record<string, unknown>;
  readonly envelopeId?: string;
}

export function createByteEnvelope(input: ByteEnvelopeInput): ByteEnvelope {
  const envelope: ByteEnvelope = {
    v: 1,
    envelopeId: input.envelopeId ?? randomId("env"),
    streamId: input.streamId,
    seq: input.seq,
    contentType: input.contentType ?? "application/octet-stream",
    format: input.format ?? "opaque",
    delivery: {
      mode: input.delivery?.mode ?? "reliable",
      ack: input.delivery?.ack ?? true,
      resume: input.delivery?.resume ?? false,
      ...(input.delivery?.ttlMs ? { ttlMs: input.delivery.ttlMs } : {}),
      ...(input.delivery?.idempotencyKey ? { idempotencyKey: input.delivery.idempotencyKey } : {})
    },
    meta: input.meta ?? {},
    payload: toBase64Url(input.payload),
    createdAt: nowIso()
  };

  validateByteEnvelope(envelope);
  return envelope;
}

export function byteEnvelopePayload(envelope: ByteEnvelope): Uint8Array {
  validateByteEnvelope(envelope);
  return fromBase64Url(envelope.payload);
}

export function validateByteEnvelope(envelope: ByteEnvelope): void {
  if (envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${envelope.v}`);
  }
  if (!envelope.envelopeId || !envelope.streamId) {
    throw new Error("Envelope must include envelopeId and streamId");
  }
  if (!Number.isSafeInteger(envelope.seq) || envelope.seq < 0) {
    throw new Error("Envelope seq must be a safe non-negative integer");
  }
  if (envelope.delivery.mode === "exactly_once" && !envelope.delivery.idempotencyKey) {
    throw new Error("exactly_once delivery requires idempotencyKey");
  }
}

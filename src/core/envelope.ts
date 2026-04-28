import { fromBase64Url, isBase64Url, nowIso, randomId, stableJson, toBase64Url } from "../utils/encoding.js";

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

export interface ByteEnvelopeValidationOptions {
  readonly maxPayloadBytes?: number;
  readonly maxMetaBytes?: number;
}

export const defaultMaxEnvelopePayloadBytes = 1024 * 1024;
export const defaultMaxEnvelopeMetaBytes = 16 * 1024;

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

export function byteEnvelopePayload(
  envelope: ByteEnvelope,
  options: ByteEnvelopeValidationOptions = {}
): Uint8Array {
  validateByteEnvelope(envelope, options);
  return fromBase64Url(envelope.payload);
}

export function validateByteEnvelope(
  envelope: ByteEnvelope,
  options: ByteEnvelopeValidationOptions = {}
): void {
  const maxPayloadBytes = options.maxPayloadBytes ?? defaultMaxEnvelopePayloadBytes;
  const maxMetaBytes = options.maxMetaBytes ?? defaultMaxEnvelopeMetaBytes;

  if (envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${envelope.v}`);
  }
  if (!isNonEmptyString(envelope.envelopeId) || !isNonEmptyString(envelope.streamId)) {
    throw new Error("Envelope must include envelopeId and streamId");
  }
  if (!Number.isSafeInteger(envelope.seq) || envelope.seq < 0) {
    throw new Error("Envelope seq must be a safe non-negative integer");
  }
  if (!isNonEmptyString(envelope.contentType) || !isNonEmptyString(envelope.format)) {
    throw new Error("Envelope contentType and format are required");
  }
  if (!isBase64Url(envelope.payload)) {
    throw new Error("Envelope payload must be base64url");
  }
  if (fromBase64Url(envelope.payload).length > maxPayloadBytes) {
    throw new Error("Envelope payload exceeds configured limit");
  }
  if (stableJson(envelope.meta).length > maxMetaBytes) {
    throw new Error("Envelope metadata exceeds configured limit");
  }
  if (envelope.delivery.ttlMs !== undefined && (!Number.isSafeInteger(envelope.delivery.ttlMs) || envelope.delivery.ttlMs <= 0)) {
    throw new Error("Envelope ttlMs must be a safe positive integer");
  }
  if (envelope.delivery.mode === "exactly_once" && !envelope.delivery.idempotencyKey) {
    throw new Error("exactly_once delivery requires idempotencyKey");
  }
}

function isNonEmptyString(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

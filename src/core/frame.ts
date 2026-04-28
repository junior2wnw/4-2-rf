import { fromBase64Url, isBase64Url, readUtf8, stableJson, toBase64Url, utf8 } from "../utils/encoding.js";
import type { SealedFrame } from "./session.js";

export const sealedFramePrefix = "trustlink:v1:frame:";
export const defaultMaxCiphertextBytes = 1024 * 1024;

export interface FrameValidationOptions {
  readonly maxCiphertextBytes?: number;
}

export function serializeSealedFrame(frame: SealedFrame, options: FrameValidationOptions = {}): string {
  validateSealedFrame(frame, options);
  return `${sealedFramePrefix}${toBase64Url(utf8(stableJson(frame)))}`;
}

export function parseSealedFrame(value: string, options: FrameValidationOptions = {}): SealedFrame {
  const encoded = value.startsWith(sealedFramePrefix)
    ? value.slice(sealedFramePrefix.length)
    : value;
  if (!encoded) {
    throw new Error("Sealed frame payload missing");
  }
  const frame = JSON.parse(readUtf8(fromBase64Url(encoded))) as SealedFrame;
  validateSealedFrame(frame, options);
  return frame;
}

export function validateSealedFrame(frame: SealedFrame, options: FrameValidationOptions = {}): void {
  const maxCiphertextBytes = options.maxCiphertextBytes ?? defaultMaxCiphertextBytes;

  if (frame.v !== 1) {
    throw new Error(`Unsupported sealed frame version: ${String(frame.v)}`);
  }
  requireNonEmpty("sessionId", frame.sessionId);
  requireNonEmpty("fromDeviceId", frame.fromDeviceId);
  requireNonEmpty("toDeviceId", frame.toDeviceId);
  if (!Number.isSafeInteger(frame.seq) || frame.seq <= 0) {
    throw new Error("Sealed frame seq must be a safe positive integer");
  }
  requireBase64Url("nonce", frame.nonce);
  requireBase64Url("ciphertext", frame.ciphertext);
  requireBase64Url("tag", frame.tag);

  if (fromBase64Url(frame.nonce).length !== 12) {
    throw new Error("Sealed frame nonce must be 12 bytes");
  }
  if (fromBase64Url(frame.tag).length !== 16) {
    throw new Error("Sealed frame tag must be 16 bytes");
  }
  if (fromBase64Url(frame.ciphertext).length > maxCiphertextBytes) {
    throw new Error("Sealed frame ciphertext exceeds configured limit");
  }
}

function requireNonEmpty(name: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Sealed frame ${name} is required`);
  }
}

function requireBase64Url(name: string, value: string): void {
  if (typeof value !== "string" || value.length === 0 || !isBase64Url(value)) {
    throw new Error(`Sealed frame ${name} must be base64url`);
  }
}

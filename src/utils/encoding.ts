import { createHash, randomBytes } from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function randomId(prefix: string): string {
  return `${prefix}_${toBase64Url(randomBytes(16))}`;
}

export function toBase64Url(value: Buffer | Uint8Array | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function fromBase64Url(value: string): Buffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

export function sha256(value: Buffer | Uint8Array | string): Buffer {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return createHash("sha256").update(buffer).digest();
}

export function sha256Base64Url(value: Buffer | Uint8Array | string): string {
  return toBase64Url(sha256(value));
}

export function shortFingerprint(value: Buffer | Uint8Array | string): string {
  const digest = sha256(value).subarray(0, 12).toString("hex").toUpperCase();
  return digest.match(/.{1,4}/g)?.join("-") ?? digest;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) {
        sorted[key] = sortJson(item);
      }
    }
    return sorted;
  }

  return value;
}

export function utf8(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export function readUtf8(value: Uint8Array): string {
  return Buffer.from(value).toString("utf8");
}

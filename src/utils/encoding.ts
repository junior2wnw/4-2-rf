const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function utf8(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function readUtf8(value: Uint8Array): string {
  return textDecoder.decode(value);
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function toBase64Url(value: Uint8Array): string {
  let output = "";
  for (let index = 0; index < value.length; index += 3) {
    const first = value[index] ?? 0;
    const second = value[index + 1] ?? 0;
    const third = value[index + 2] ?? 0;
    const packed = (first << 16) | (second << 8) | third;
    output += base64Alphabet[(packed >> 18) & 63];
    output += base64Alphabet[(packed >> 12) & 63];
    output += index + 1 < value.length ? base64Alphabet[(packed >> 6) & 63] : "=";
    output += index + 2 < value.length ? base64Alphabet[packed & 63] : "=";
  }
  return output.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function fromBase64Url(value: string): Uint8Array {
  if (!isBase64Url(value.replace(/=+$/u, ""))) {
    throw new Error("Invalid base64url input");
  }
  let buffer = 0;
  let bits = 0;
  const output: number[] = [];
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").replace(/=+$/u, "");
  if (normalized.length % 4 === 1) {
    throw new Error("Invalid base64url input length");
  }
  for (const char of normalized) {
    const next = base64Alphabet.indexOf(char);
    if (next < 0) {
      throw new Error("Invalid base64url input");
    }
    buffer = (buffer << 6) | next;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 255);
    }
  }
  return new Uint8Array(output);
}

export function shortFingerprint(hashBytes: Uint8Array): string {
  return toBase64Url(hashBytes).slice(0, 12).toUpperCase();
}

export function randomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new Error("Random byte length must be a safe positive integer");
  }
  const cryptoApi = globalThis.crypto as { getRandomValues?: (bytes: Uint8Array) => Uint8Array } | undefined;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("No secure random source is available");
  }
  const bytes = new Uint8Array(length);
  cryptoApi.getRandomValues(bytes);
  return bytes;
}

export function randomId(prefix: string): string {
  return `${prefix}_${toBase64Url(randomBytes(16))}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function stableJsonBytes(value: unknown): Uint8Array {
  return utf8(stableJson(value));
}

export function isBase64Url(value: string): boolean {
  return [...value].every((char) => base64UrlAlphabet.includes(char));
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

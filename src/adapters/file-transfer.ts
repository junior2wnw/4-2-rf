import { createHash } from "node:crypto";
import { createEnvelope, MessageEnvelope } from "../core/envelope.js";
import { toBase64Url } from "../utils/encoding.js";

export interface FileChunkPlan {
  readonly transferId: string;
  readonly filename: string;
  readonly totalBytes: number;
  readonly chunkSize: number;
  readonly totalChunks: number;
}

export interface FileChunk {
  readonly transferId: string;
  readonly filename: string;
  readonly index: number;
  readonly totalChunks: number;
  readonly bytes: Buffer;
  readonly sha256: string;
}

export function planFileTransfer(
  transferId: string,
  filename: string,
  totalBytes: number,
  chunkSize = 1024 * 1024
): FileChunkPlan {
  if (totalBytes < 0) {
    throw new Error("totalBytes must be positive");
  }
  if (chunkSize <= 0) {
    throw new Error("chunkSize must be positive");
  }

  return {
    transferId,
    filename,
    totalBytes,
    chunkSize,
    totalChunks: Math.max(1, Math.ceil(totalBytes / chunkSize))
  };
}

export function createFileChunk(
  plan: FileChunkPlan,
  index: number,
  bytes: Buffer
): FileChunk {
  if (index < 0 || index >= plan.totalChunks) {
    throw new Error(`Chunk index out of range: ${index}`);
  }

  return {
    transferId: plan.transferId,
    filename: plan.filename,
    index,
    totalChunks: plan.totalChunks,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

export function fileChunkEnvelope(chunk: FileChunk): MessageEnvelope<string> {
  return createEnvelope({
    channel: "files",
    type: "chunk",
    contentType: "application/octet-stream",
    encoding: "base64url",
    payload: toBase64Url(chunk.bytes),
    delivery: {
      mode: "reliable",
      ack: true,
      resume: true,
      idempotencyKey: `${chunk.transferId}:${chunk.index}`
    },
    meta: {
      transferId: chunk.transferId,
      filename: chunk.filename,
      chunkIndex: chunk.index,
      totalChunks: chunk.totalChunks,
      sha256: chunk.sha256
    }
  });
}

export function missingChunks(totalChunks: number, received: readonly number[]): number[] {
  const seen = new Set(received);
  return Array.from({ length: totalChunks }, (_, index) => index).filter((index) => !seen.has(index));
}

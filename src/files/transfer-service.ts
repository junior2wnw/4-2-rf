import { createFileChunk, fileChunkEnvelope, FileChunkPlan, missingChunks, planFileTransfer } from "../adapters/file-transfer.js";
import { MessageEnvelope } from "../core/envelope.js";
import { randomId } from "../utils/encoding.js";

export interface PreparedFileTransfer {
  readonly plan: FileChunkPlan;
  readonly chunks: readonly MessageEnvelope<string>[];
}

export class FileTransferService {
  prepareBuffer(filename: string, bytes: Buffer, chunkSize = 1024 * 1024): PreparedFileTransfer {
    const plan = planFileTransfer(randomId("transfer"), filename, bytes.length, chunkSize);
    const chunks: MessageEnvelope<string>[] = [];

    for (let index = 0; index < plan.totalChunks; index += 1) {
      const start = index * plan.chunkSize;
      const end = Math.min(bytes.length, start + plan.chunkSize);
      chunks.push(fileChunkEnvelope(createFileChunk(plan, index, bytes.subarray(start, end))));
    }

    return { plan, chunks };
  }

  missing(plan: FileChunkPlan, receivedIndexes: readonly number[]): number[] {
    return missingChunks(plan.totalChunks, receivedIndexes);
  }
}

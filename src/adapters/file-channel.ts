import { createEnvelope, MessageEnvelope } from "../core/envelope.js";
import { ChannelAdapter, ChannelContext } from "../streams/channel.js";
import { sha256Base64Url } from "../utils/encoding.js";

export interface FileManifestInput {
  readonly filename: string;
  readonly totalBytes: number;
  readonly contentType?: string;
  readonly bytesSha256?: string;
}

export class FileChannelAdapter implements ChannelAdapter<FileManifestInput, FileManifestInput & { bytesSha256: string }> {
  readonly channel = "files";
  readonly capabilities = ["files.send"];

  createEnvelope(input: FileManifestInput, context: ChannelContext): MessageEnvelope<FileManifestInput & { bytesSha256: string }> {
    context.requirePermission({ channel: this.channel, action: "send" });
    const payload = {
      ...input,
      bytesSha256: input.bytesSha256 ?? sha256Base64Url(`${input.filename}:${input.totalBytes}`)
    };

    return createEnvelope({
      channel: this.channel,
      type: "manifest",
      contentType: "application/json",
      encoding: "json",
      payload,
      delivery: {
        mode: "reliable",
        ack: true,
        resume: true,
        idempotencyKey: `file:${payload.bytesSha256}`
      },
      meta: {
        filename: payload.filename,
        totalBytes: payload.totalBytes
      }
    });
  }
}

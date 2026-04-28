import { randomId } from "../utils/encoding.js";

export type StreamState = "open" | "closing" | "closed";

export interface StreamLimitPolicy {
  readonly maxOpenStreams: number;
  readonly maxBufferedMessagesPerStream: number;
}

export interface LogicalStream {
  readonly id: string;
  readonly channel: string;
  readonly openedAt: string;
  readonly state: StreamState;
  readonly bufferedMessages: number;
}

export class StreamMultiplexer {
  private readonly streams = new Map<string, LogicalStream>();

  constructor(private readonly policy: StreamLimitPolicy = {
    maxOpenStreams: 64,
    maxBufferedMessagesPerStream: 256
  }) {}

  open(channel: string): LogicalStream {
    const openCount = [...this.streams.values()].filter((stream) => stream.state === "open").length;
    if (openCount >= this.policy.maxOpenStreams) {
      throw new Error("Open stream limit reached");
    }

    const stream: LogicalStream = {
      id: randomId("str"),
      channel,
      openedAt: new Date().toISOString(),
      state: "open",
      bufferedMessages: 0
    };
    this.streams.set(stream.id, stream);
    return stream;
  }

  noteBuffered(streamId: string): LogicalStream {
    const stream = this.require(streamId);
    const next = stream.bufferedMessages + 1;
    if (next > this.policy.maxBufferedMessagesPerStream) {
      throw new Error("Stream buffer limit reached");
    }
    return this.replace(streamId, { ...stream, bufferedMessages: next });
  }

  noteDelivered(streamId: string): LogicalStream {
    const stream = this.require(streamId);
    return this.replace(streamId, {
      ...stream,
      bufferedMessages: Math.max(0, stream.bufferedMessages - 1)
    });
  }

  close(streamId: string): LogicalStream {
    const stream = this.require(streamId);
    return this.replace(streamId, { ...stream, state: "closed" });
  }

  list(): LogicalStream[] {
    return [...this.streams.values()].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  }

  private require(streamId: string): LogicalStream {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Unknown stream: ${streamId}`);
    }
    return stream;
  }

  private replace(streamId: string, stream: LogicalStream): LogicalStream {
    this.streams.set(streamId, stream);
    return stream;
  }
}

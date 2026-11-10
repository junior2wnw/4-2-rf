import { DiscoveryEndpoint } from "./discovery.js";
import { SealedFrame } from "./session.js";

export interface TransportConnection {
  readonly id: string;
  readonly endpoint: DiscoveryEndpoint;
  send(frame: SealedFrame): Promise<void>;
  close(reason?: string): Promise<void>;
}

export interface TransportAdapter {
  readonly kind: DiscoveryEndpoint["transport"];
  connect(endpoint: DiscoveryEndpoint, signal?: AbortSignal): Promise<TransportConnection>;
}

export class MemoryTransportConnection implements TransportConnection {
  readonly received: SealedFrame[] = [];
  private closed = false;

  constructor(
    readonly id: string,
    readonly endpoint: DiscoveryEndpoint
  ) {}

  async send(frame: SealedFrame): Promise<void> {
    if (this.closed) {
      throw new Error("Transport connection is closed");
    }
    this.received.push(frame);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export class MemoryTransportAdapter implements TransportAdapter {
  readonly kind = "memory.frame" as const;

  async connect(endpoint: DiscoveryEndpoint, signal?: AbortSignal): Promise<TransportConnection> {
    if (signal?.aborted) {
      throw new Error("Connection aborted");
    }
    if (endpoint.transport !== this.kind) {
      throw new Error(`Memory adapter only supports ${this.kind}`);
    }
    return new MemoryTransportConnection(`mem:${endpoint.peerId}:${Date.now()}`, endpoint);
  }
}

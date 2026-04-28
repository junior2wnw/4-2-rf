import { SealedFrame } from "./session.js";

export interface TransportConnection<TFrame = SealedFrame> {
  readonly id: string;
  readonly peerId: string;
  send(frame: TFrame): Promise<void>;
  close(reason?: string): Promise<void>;
}

export interface TransportAdapter<TEndpoint = unknown, TFrame = SealedFrame> {
  readonly id: string;
  connect(endpoint: TEndpoint, signal?: AbortSignal): Promise<TransportConnection<TFrame>>;
}

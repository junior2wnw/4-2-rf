import { MessageEnvelope } from "../core/envelope.js";
import { PermissionRequest } from "../core/permissions.js";

export interface ChannelContext {
  readonly peerId: string;
  readonly channel: string;
  requirePermission(request: PermissionRequest): void;
}

export interface ChannelAdapter<TInput = unknown, TPayload = unknown> {
  readonly channel: string;
  readonly capabilities: readonly string[];
  createEnvelope(input: TInput, context: ChannelContext): MessageEnvelope<TPayload>;
}

export class ChannelRegistry {
  private readonly adapters = new Map<string, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    if (this.adapters.has(adapter.channel)) {
      throw new Error(`Channel already registered: ${adapter.channel}`);
    }
    this.adapters.set(adapter.channel, adapter);
  }

  get(channel: string): ChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new Error(`Unknown channel: ${channel}`);
    }
    return adapter;
  }

  list(): ChannelAdapter[] {
    return [...this.adapters.values()].sort((a, b) => a.channel.localeCompare(b.channel));
  }
}

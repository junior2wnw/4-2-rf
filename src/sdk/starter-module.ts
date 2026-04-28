import { FileChannelAdapter } from "../adapters/file-channel.js";
import { MessageChannelAdapter } from "../adapters/message-channel.js";
import { StaticDiscoveryProvider } from "../core/discovery.js";
import { MemoryTransportAdapter } from "../core/transport.js";
import { QrcodeRenderer } from "../pairing/qr.js";
import { MemoryKeyStore, MemoryTrustRecordStore } from "../storage/memory.js";
import { defineTrustLinkModule, TrustLinkModule } from "./module.js";

export function createStarterModule(): TrustLinkModule {
  return defineTrustLinkModule({
    manifest: {
      id: "trustlink.starter",
      name: "TrustLink Starter Module",
      version: "0.1.0",
      kind: "tool",
      description: "Optional adapters for demos, examples, and local development.",
      capabilities: [
        "keys.memory",
        "trust.memory",
        "channel.messages",
        "channel.files",
        "discovery.static",
        "transport.memory",
        "qr"
      ]
    },
    setup(context) {
      context.registry.registerKeyStore(new MemoryKeyStore());
      context.registry.registerTrustStore(new MemoryTrustRecordStore());
      context.registry.registerChannelAdapter(new MessageChannelAdapter());
      context.registry.registerChannelAdapter(new FileChannelAdapter());
      context.registry.registerDiscoveryProvider(new StaticDiscoveryProvider([]));
      context.registry.registerTransportAdapter(new MemoryTransportAdapter());
      context.registry.registerQrRenderer(new QrcodeRenderer());
    }
  });
}

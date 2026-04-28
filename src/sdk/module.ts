import { DiscoveryProvider } from "../core/discovery.js";
import { TransportAdapter } from "../core/transport.js";
import { QrRenderer } from "../pairing/qr.js";
import { KeyStore, TrustRecordStore } from "../storage/contracts.js";
import { UiAdapter } from "../ui/contracts.js";
import { ChannelAdapter } from "../streams/channel.js";

export type TrustLinkModuleKind =
  | "key_store"
  | "trust_store"
  | "discovery"
  | "transport"
  | "channel"
  | "ui"
  | "qr"
  | "policy"
  | "tool";

export interface TrustLinkModuleManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly kind: TrustLinkModuleKind;
  readonly description: string;
  readonly capabilities?: readonly string[];
}

export interface TrustLinkModuleContext {
  readonly registry: ModuleRegistry;
  log(message: string, meta?: Record<string, string | number | boolean>): void;
}

export interface TrustLinkModule {
  readonly manifest: TrustLinkModuleManifest;
  setup(context: TrustLinkModuleContext): void | Promise<void>;
}

export interface RegisteredAdapters {
  readonly keyStores: readonly KeyStore[];
  readonly trustStores: readonly TrustRecordStore[];
  readonly discoveryProviders: readonly DiscoveryProvider[];
  readonly transportAdapters: readonly TransportAdapter[];
  readonly channelAdapters: readonly ChannelAdapter[];
  readonly uiAdapters: readonly UiAdapter[];
  readonly qrRenderers: readonly QrRenderer[];
}

export class ModuleRegistry {
  private readonly modules = new Map<string, TrustLinkModuleManifest>();
  private readonly keyStores: KeyStore[] = [];
  private readonly trustStores: TrustRecordStore[] = [];
  private readonly discoveryProviders: DiscoveryProvider[] = [];
  private readonly transportAdapters: TransportAdapter[] = [];
  private readonly channelAdapters: ChannelAdapter[] = [];
  private readonly uiAdapters: UiAdapter[] = [];
  private readonly qrRenderers: QrRenderer[] = [];

  registerModule(manifest: TrustLinkModuleManifest): void {
    const existing = this.modules.get(manifest.id);
    if (existing) {
      throw new Error(`Module already registered: ${manifest.id}`);
    }
    this.modules.set(manifest.id, manifest);
  }

  async use(module: TrustLinkModule): Promise<void> {
    this.registerModule(module.manifest);
    await module.setup({
      registry: this,
      log: () => undefined
    });
  }

  registerKeyStore(adapter: KeyStore): void {
    this.keyStores.push(adapter);
  }

  registerTrustStore(adapter: TrustRecordStore): void {
    this.trustStores.push(adapter);
  }

  registerDiscoveryProvider(adapter: DiscoveryProvider): void {
    this.discoveryProviders.push(adapter);
  }

  registerTransportAdapter(adapter: TransportAdapter): void {
    this.transportAdapters.push(adapter);
  }

  registerChannelAdapter(adapter: ChannelAdapter): void {
    this.channelAdapters.push(adapter);
  }

  registerUiAdapter(adapter: UiAdapter): void {
    this.uiAdapters.push(adapter);
  }

  registerQrRenderer(adapter: QrRenderer): void {
    this.qrRenderers.push(adapter);
  }

  listModules(): TrustLinkModuleManifest[] {
    return [...this.modules.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  adapters(): RegisteredAdapters {
    return {
      keyStores: [...this.keyStores],
      trustStores: [...this.trustStores],
      discoveryProviders: [...this.discoveryProviders],
      transportAdapters: [...this.transportAdapters],
      channelAdapters: [...this.channelAdapters],
      uiAdapters: [...this.uiAdapters],
      qrRenderers: [...this.qrRenderers]
    };
  }
}

export function defineTrustLinkModule(module: TrustLinkModule): TrustLinkModule {
  return module;
}

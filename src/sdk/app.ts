import { AuditLog } from "../core/audit.js";
import { createDeviceIdentity, DeviceIdentity } from "../core/identity.js";
import { TrustStore } from "../core/trust.js";
import { createHeadlessUiBridge, HeadlessUiBridge } from "../ui/headless.js";
import { ModuleRegistry, TrustLinkModule } from "./module.js";

export interface TrustLinkAppOptions {
  readonly label: string;
  readonly identity?: DeviceIdentity;
  readonly trustStore?: TrustStore;
  readonly modules?: readonly TrustLinkModule[];
}

export class TrustLinkApp {
  readonly identity: DeviceIdentity;
  readonly trustStore: TrustStore;
  readonly audit = new AuditLog();
  readonly modules = new ModuleRegistry();
  readonly ui: HeadlessUiBridge;

  private constructor(options: TrustLinkAppOptions) {
    this.identity = options.identity ?? createDeviceIdentity(options.label);
    this.trustStore = options.trustStore ?? TrustStore.empty();
    this.ui = createHeadlessUiBridge({
      device: {
        id: this.identity.id,
        label: this.identity.label,
        fingerprint: this.identity.fingerprint
      },
      peers: [],
      connections: []
    });
  }

  static async create(options: TrustLinkAppOptions): Promise<TrustLinkApp> {
    const app = new TrustLinkApp(options);
    for (const module of options.modules ?? []) {
      await app.modules.use(module);
    }
    return app;
  }
}

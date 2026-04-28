import { defineTrustLinkModule, TrustLinkModule } from "./module.js";

export function createKernelModule(): TrustLinkModule {
  return defineTrustLinkModule({
    manifest: {
      id: "trustlink.kernel",
      name: "TrustLink Kernel",
      version: "0.1.0",
      kind: "tool",
      description: "The minimal TrustLink technology layer with extension points only.",
      capabilities: ["modules", "identity", "trust", "sessions", "envelopes", "link-space"]
    },
    setup() {
      return undefined;
    }
  });
}

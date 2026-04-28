import { TrustLinkModule } from "./module.js";
import { createStarterModule } from "./starter-module.js";

export function createCoreModule(): TrustLinkModule {
  return createStarterModule();
}

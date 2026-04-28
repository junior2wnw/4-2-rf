import { nowIso } from "../utils/encoding.js";
import { TransportKind } from "./path.js";

export type DiscoverySource =
  | "lan_mdns"
  | "udp_broadcast"
  | "ipv6_multicast"
  | "known_endpoint"
  | "rendezvous"
  | "manual";

export interface DiscoveryEndpoint {
  readonly peerId: string;
  readonly endpoint: string;
  readonly transport: TransportKind;
  readonly source: DiscoverySource;
  readonly capabilities: readonly string[];
  readonly observedAt: string;
  readonly expiresAt?: string;
}

export interface DiscoveryProvider {
  readonly name: string;
  discover(peerId: string): Promise<readonly DiscoveryEndpoint[]>;
}

export class StaticDiscoveryProvider implements DiscoveryProvider {
  readonly name = "static";

  constructor(private readonly endpoints: readonly DiscoveryEndpoint[]) {}

  async discover(peerId: string): Promise<readonly DiscoveryEndpoint[]> {
    return this.endpoints.filter((endpoint) => endpoint.peerId === peerId && !isExpired(endpoint));
  }
}

export class CompositeDiscoveryProvider implements DiscoveryProvider {
  readonly name = "composite";

  constructor(private readonly providers: readonly DiscoveryProvider[]) {}

  async discover(peerId: string): Promise<readonly DiscoveryEndpoint[]> {
    const discovered = await Promise.all(this.providers.map((provider) => provider.discover(peerId)));
    return dedupeEndpoints(discovered.flat().filter((endpoint) => !isExpired(endpoint)));
  }
}

export function manualEndpoint(input: Omit<DiscoveryEndpoint, "observedAt">): DiscoveryEndpoint {
  return {
    ...input,
    observedAt: nowIso()
  };
}

export function dedupeEndpoints(endpoints: readonly DiscoveryEndpoint[]): DiscoveryEndpoint[] {
  const byKey = new Map<string, DiscoveryEndpoint>();
  for (const endpoint of endpoints) {
    byKey.set(`${endpoint.peerId}:${endpoint.transport}:${endpoint.endpoint}`, endpoint);
  }
  return [...byKey.values()].sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

function isExpired(endpoint: DiscoveryEndpoint): boolean {
  return endpoint.expiresAt ? Date.parse(endpoint.expiresAt) <= Date.now() : false;
}

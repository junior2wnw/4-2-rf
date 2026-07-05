export const linkTrafficSchema = "trustlink.link-traffic.v1";

export const linkControlCapability = "link.control";
export const linkTrafficExitCapability = "traffic.exit";
export const linkTrafficProxyCapability = "traffic.proxy";
export const linkTrafficSystemCapability = "traffic.system";

export const linkTrafficCapabilities = [
  linkTrafficExitCapability,
  linkTrafficProxyCapability,
  linkTrafficSystemCapability
] as const;

export const linkTrafficModes = ["proxy", "system"] as const;
export const linkTrafficTargetStatuses = ["available", "planned", "disabled"] as const;

export type LinkTrafficCapability = (typeof linkTrafficCapabilities)[number];
export type LinkTrafficMode = (typeof linkTrafficModes)[number];
export type LinkTrafficTargetStatus = (typeof linkTrafficTargetStatuses)[number];

export interface LinkTrafficGrant {
  readonly schema: typeof linkTrafficSchema;
  readonly enabled: boolean;
  readonly mode: LinkTrafficMode;
  readonly capabilities: readonly string[];
  readonly policy: "explicit-link-grant-only";
  readonly updatedAt?: string;
}

export interface LinkTrafficTarget {
  readonly id: string;
  readonly label?: string;
  readonly hostDeviceId?: string;
  readonly deviceIds?: readonly string[];
  readonly exit: boolean;
  readonly mode: LinkTrafficMode;
  readonly status: LinkTrafficTargetStatus;
  readonly adapter?: string;
  readonly share?: boolean;
  readonly updatedAt?: string;
}

export function linkTrafficGrantCapabilities(enabled: boolean, mode: LinkTrafficMode = "proxy"): string[] {
  if (!enabled) {
    return [linkControlCapability];
  }
  const normalizedMode = normalizeLinkTrafficMode(mode);
  return [
    linkControlCapability,
    linkTrafficExitCapability,
    normalizedMode === "system" ? linkTrafficSystemCapability : linkTrafficProxyCapability
  ];
}

export function buildLinkTrafficGrant(options: {
  readonly enabled: boolean;
  readonly mode?: LinkTrafficMode | string;
  readonly updatedAt?: string;
}): LinkTrafficGrant {
  const mode = normalizeLinkTrafficMode(options.mode);
  return {
    schema: linkTrafficSchema,
    enabled: options.enabled === true,
    mode,
    capabilities: linkTrafficGrantCapabilities(options.enabled === true, mode),
    policy: "explicit-link-grant-only",
    ...(options.updatedAt ? { updatedAt: options.updatedAt } : {})
  };
}

export function capabilitiesAllowLinkTraffic(capabilities: readonly string[] | undefined): boolean {
  return sanitizeLinkTrafficCapabilities(capabilities).includes(linkTrafficExitCapability);
}

export function linkTrafficModeFromCapabilities(capabilities: readonly string[] | undefined): LinkTrafficMode {
  const clean = sanitizeLinkTrafficCapabilities(capabilities);
  return clean.includes(linkTrafficSystemCapability) ? "system" : "proxy";
}

export function sanitizeLinkTrafficCapabilities(capabilities: readonly string[] | undefined): string[] {
  const clean = new Set<string>();
  for (const capability of capabilities || []) {
    const value = normalizeCapabilityName(capability);
    if (value) {
      clean.add(value);
    }
  }
  return [...clean].sort();
}

export function normalizeLinkTrafficMode(value: unknown): LinkTrafficMode {
  return value === "system" ? "system" : "proxy";
}

export function normalizeLinkTrafficTargetStatus(value: unknown): LinkTrafficTargetStatus {
  return value === "available" || value === "disabled" ? value : "planned";
}

export function normalizeLinkTrafficTarget(value: unknown): LinkTrafficTarget | null {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = cleanText(record.id, 180);
  if (!id) {
    return null;
  }
  const deviceIds = Array.isArray(record.deviceIds)
    ? record.deviceIds.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 32)
    : [];
  return {
    id,
    ...(cleanText(record.label, 180) ? { label: cleanText(record.label, 180) } : {}),
    ...(cleanText(record.hostDeviceId, 180) ? { hostDeviceId: cleanText(record.hostDeviceId, 180) } : {}),
    ...(deviceIds.length ? { deviceIds } : {}),
    exit: record.exit === true,
    mode: normalizeLinkTrafficMode(record.mode),
    status: normalizeLinkTrafficTargetStatus(record.status),
    ...(cleanText(record.adapter, 120) ? { adapter: cleanText(record.adapter, 120) } : {}),
    ...(typeof record.share === "boolean" ? { share: record.share } : {}),
    ...(cleanText(record.updatedAt, 80) ? { updatedAt: cleanText(record.updatedAt, 80) } : {})
  };
}

export function linkTrafficRequiresConfirmation(capabilities: readonly string[] | undefined): boolean {
  const clean = sanitizeLinkTrafficCapabilities(capabilities);
  return clean.includes(linkTrafficExitCapability)
    || clean.includes(linkTrafficSystemCapability)
    || clean.includes(linkTrafficProxyCapability);
}

function normalizeCapabilityName(value: unknown): string {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-z][a-z0-9.-]{0,63}$/u.test(text) ? text : "";
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001F\u007F]/gu, " ").trim().slice(0, max)
    : "";
}

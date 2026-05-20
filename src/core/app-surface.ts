export const appSurfaceManifestSchema = "trustlink.app-surfaces.v1";
export const appSurfaceBridgeSchema = "trustlink.app-surface.bridge.v1";
export const appSurfaceContextSchema = "trustlink.app-surface.context.v1";

export const appSurfaceKnownCapabilities = [
  "chat.append",
  "agent.invoke",
  "terminal.run",
  "file.pick",
  "file.save",
  "artifact.push",
  "job.start",
  "job.status",
  "job.stop",
  "context.refresh",
  "close"
] as const;

export type AppSurfaceKnownCapability = (typeof appSurfaceKnownCapabilities)[number];

export type AppSurfaceConnectionMode =
  | "same-origin"
  | "remote-origin"
  | "device-local"
  | "kernel-proxy";

export interface AppSurfaceConnectionIntent {
  readonly mode: AppSurfaceConnectionMode;
  readonly target?: string;
  readonly path?: string;
  readonly origin?: string;
}

export interface AppSurfaceDefinition {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly capabilities: readonly string[];
  readonly summary?: string;
  readonly connect?: AppSurfaceConnectionIntent;
}

export interface AppSurfaceUrlOptions {
  readonly baseUrl: string;
  readonly allowLoopbackHttp?: boolean;
  readonly allowTrustedHttps?: boolean;
  readonly allowedOrigins?: readonly string[];
  readonly kernelIntentSchemes?: readonly string[];
}

export interface AppSurfaceResolvedUrl {
  readonly url: string;
  readonly mode: AppSurfaceConnectionMode;
  readonly origin?: string;
  readonly frameSrc?: string;
  readonly requiresKernelProxy: boolean;
}

const defaultKernelIntentSchemes = ["trustlink:"] as const;
const localhostNames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function normalizeAppSurfaceId(value: string, maxLength = 80): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, maxLength);
}

export function resolveAppSurfaceUrl(value: string, options: AppSurfaceUrlOptions): AppSurfaceResolvedUrl {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("App surface URL is required");
  }
  if (isKernelIntentUrl(raw, options)) {
    return {
      url: raw,
      mode: "kernel-proxy",
      requiresKernelProxy: true
    };
  }

  const base = new URL(options.baseUrl);
  const url = new URL(raw, base);
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const sameOrigin = url.origin === base.origin;
  const loopback = url.protocol === "http:" && isLoopbackHost(url.hostname);
  const trustedHttps = url.protocol === "https:" && options.allowTrustedHttps !== false;
  const explicitlyAllowed = allowedOrigins.has(url.origin);

  if (!sameOrigin && !loopback && !trustedHttps && !explicitlyAllowed) {
    throw new Error(`App surface origin is rejected: ${url.origin}`);
  }
  if (loopback && options.allowLoopbackHttp !== true && !explicitlyAllowed) {
    throw new Error(`Loopback app surface requires allowLoopbackHttp: ${url.origin}`);
  }

  const mode = sameOrigin
    ? "same-origin"
    : isDeviceLocalHost(url.hostname) ? "device-local" : "remote-origin";

  const resolved: AppSurfaceResolvedUrl = {
    url: url.href,
    mode,
    origin: url.origin,
    requiresKernelProxy: false
  };
  return sameOrigin ? resolved : { ...resolved, frameSrc: url.origin };
}

export function appSurfaceAllowedOrigin(
  eventOrigin: string,
  appUrl: string,
  baseUrl: string,
  options: Pick<AppSurfaceUrlOptions, "kernelIntentSchemes"> = {}
): boolean {
  if (!eventOrigin || isKernelIntentUrl(appUrl, { baseUrl, ...options })) {
    return false;
  }
  try {
    return eventOrigin === new URL(appUrl, baseUrl).origin;
  } catch {
    return false;
  }
}

export function appSurfaceFrameSources(
  definitions: readonly Pick<AppSurfaceDefinition, "url">[],
  options: AppSurfaceUrlOptions
): string[] {
  const values = new Set<string>();
  for (const definition of definitions) {
    const resolved = resolveAppSurfaceUrl(definition.url, options);
    if (resolved.frameSrc) {
      values.add(resolved.frameSrc);
    }
  }
  return [...values].sort();
}

export function assertAppSurfaceCapabilities(capabilities: readonly string[], maximum = 40): void {
  if (capabilities.length > maximum) {
    throw new Error(`Too many app surface capabilities: ${capabilities.length}`);
  }
  for (const capability of capabilities) {
    if (!isCapabilityName(capability)) {
      throw new Error(`Invalid app surface capability: ${String(capability)}`);
    }
  }
}

export function appSurfacePermission(appId: string, capability: string): string {
  const cleanId = normalizeAppSurfaceId(appId);
  if (!cleanId || !isCapabilityName(capability)) {
    throw new Error("Invalid app surface permission");
  }
  return `app.call:${cleanId}/${capability}`;
}

function isKernelIntentUrl(value: string, options: Pick<AppSurfaceUrlOptions, "baseUrl" | "kernelIntentSchemes">): boolean {
  const scheme = value.match(/^([a-z][a-z0-9+.-]*:)/iu)?.[1]?.toLowerCase();
  if (!scheme) {
    return false;
  }
  return (options.kernelIntentSchemes ?? defaultKernelIntentSchemes).some((item) => item.toLowerCase() === scheme);
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return localhostNames.has(host) || host.startsWith("127.");
}

function isDeviceLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (isLoopbackHost(host)) {
    return true;
  }
  if (/^10\./u.test(host) || /^192\.168\./u.test(host)) {
    return true;
  }
  const private172 = host.match(/^172\.(\d+)\./u);
  if (private172) {
    const second = Number(private172[1]);
    return second >= 16 && second <= 31;
  }
  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

function isCapabilityName(value: string): boolean {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 80
    && /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/u.test(value);
}

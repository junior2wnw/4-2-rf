export const appSurfaceManifestSchema = "trustlink.app-surfaces.v1";
export const appSurfaceBridgeSchema = "trustlink.app-surface.bridge.v1";
export const appSurfaceContextSchema = "trustlink.app-surface.context.v1";
export const appSurfaceInstallSchema = "trustlink.app-surface.install.v1";

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
  "window.collapse",
  "window.resize"
] as const;

export type AppSurfaceKnownCapability = (typeof appSurfaceKnownCapabilities)[number];

export type AppSurfaceConnectionMode =
  | "inline"
  | "same-origin"
  | "remote-origin"
  | "device-local"
  | "kernel-proxy";

export const appSurfaceInstallScopes = ["account", "chat", "device"] as const;

export type AppSurfaceInstallScope = (typeof appSurfaceInstallScopes)[number];

export const appSurfaceWindowLayouts = ["half", "compact", "large", "full", "floating"] as const;

export type AppSurfaceWindowLayout = (typeof appSurfaceWindowLayouts)[number];

export interface AppSurfaceDisplay {
  readonly layout: AppSurfaceWindowLayout;
  readonly width?: string;
  readonly height?: string;
}

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
  readonly inlineHtml?: string;
  readonly capabilities: readonly string[];
  readonly summary?: string;
  readonly display?: AppSurfaceDisplay;
  readonly connect?: AppSurfaceConnectionIntent;
}

export interface AppSurfaceInstallPlan {
  readonly schema: typeof appSurfaceInstallSchema;
  readonly definition: AppSurfaceDefinition;
  readonly scope: AppSurfaceInstallScope;
  readonly targetDeviceId?: string;
  readonly open: boolean;
  readonly mode: AppSurfaceConnectionMode;
  readonly frameSrc?: string;
  readonly requiresKernelProxy: boolean;
  readonly revision?: string;
  readonly installedAt: string;
}

export interface AppSurfaceUrlOptions {
  readonly baseUrl: string;
  readonly allowLoopbackHttp?: boolean;
  readonly allowTrustedHttps?: boolean;
  readonly allowedOrigins?: readonly string[];
  readonly kernelIntentSchemes?: readonly string[];
}

export interface AppSurfaceInstallOptions extends AppSurfaceUrlOptions {
  readonly allowedScopes?: readonly AppSurfaceInstallScope[];
  readonly allowKernelProxy?: boolean;
  readonly allowInlineHtml?: boolean;
  readonly maximumCapabilities?: number;
  readonly maximumInlineHtmlBytes?: number;
  readonly now?: string;
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

export function normalizeAppSurfaceInstallRequest(input: unknown, options: AppSurfaceInstallOptions): AppSurfaceInstallPlan {
  if (!isRecord(input)) {
    throw new Error("App surface install request is required");
  }
  const source = isRecord(input.app) ? input.app : input;
  const id = normalizeAppSurfaceId(recordString(source, "id"));
  const title = normalizeDisplayText(recordString(source, "title") || id, 80);
  const rawUrl = recordString(source, "url");
  const inlineHtml = normalizeInlineHtml(recordString(source, "inlineHtml") || recordString(source, "html"), options);
  const capabilities = normalizeAppSurfaceCapabilities(source.capabilities, options.maximumCapabilities ?? 40);
  const scope = normalizeAppSurfaceInstallScope(recordString(input, "scope") || recordString(source, "scope") || "account");
  const allowedScopes = new Set(options.allowedScopes ?? appSurfaceInstallScopes);
  if (!id || !title) {
    throw new Error("App surface id and title are required");
  }
  if (!allowedScopes.has(scope)) {
    throw new Error(`App surface scope is rejected: ${scope}`);
  }
  const resolved = inlineHtml
    ? {
      url: "about:srcdoc",
      mode: "inline" as const,
      requiresKernelProxy: false
    }
    : resolveAppSurfaceUrl(rawUrl, options);
  if (resolved.requiresKernelProxy && options.allowKernelProxy !== true) {
    throw new Error("App surface kernel proxy requires shell support");
  }
  const summary = normalizeDisplayText(recordString(source, "summary"), 180);
  const targetDeviceId = normalizeTargetId(recordString(input, "targetDeviceId") || recordString(source, "targetDeviceId"));
  const revision = normalizeRevision(recordString(input, "revision") || recordString(source, "revision"));
  const display = normalizeAppSurfaceDisplay(source);
  const connect = normalizeAppSurfaceConnect(source.connect);
  return {
    schema: appSurfaceInstallSchema,
    definition: {
      id,
      title,
      url: resolved.url,
      ...(inlineHtml ? { inlineHtml } : {}),
      capabilities,
      ...(summary ? { summary } : {}),
      display,
      ...(connect ? { connect } : {})
    },
    scope,
    ...(targetDeviceId ? { targetDeviceId } : {}),
    open: input.open === true || source.open === true,
    mode: resolved.mode,
    ...(resolved.frameSrc ? { frameSrc: resolved.frameSrc } : {}),
    requiresKernelProxy: resolved.requiresKernelProxy,
    ...(revision ? { revision } : {}),
    installedAt: normalizeIsoTime(options.now) || new Date().toISOString()
  };
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

function normalizeAppSurfaceCapabilities(value: unknown, maximum: number): string[] {
  const rawItems = Array.isArray(value) ? value : [];
  const result: string[] = [];
  for (const item of rawItems) {
    if (typeof item !== "string") {
      continue;
    }
    const capability = item.trim().toLowerCase();
    if (!capability || result.includes(capability)) {
      continue;
    }
    result.push(capability);
  }
  assertAppSurfaceCapabilities(result, maximum);
  return result;
}

function normalizeAppSurfaceInstallScope(value: string): AppSurfaceInstallScope {
  const clean = String(value || "").trim().toLowerCase();
  return appSurfaceInstallScopes.includes(clean as AppSurfaceInstallScope)
    ? clean as AppSurfaceInstallScope
    : "account";
}

function normalizeAppSurfaceDisplay(source: Record<string, unknown>): AppSurfaceDisplay {
  const displaySource = isRecord(source.display) ? source.display : source;
  const layout = normalizeAppSurfaceWindowLayout(
    recordString(displaySource, "layout")
      || recordString(displaySource, "windowLayout")
      || recordString(displaySource, "mode")
  );
  const width = normalizeCssSize(recordString(displaySource, "width"));
  const height = normalizeCssSize(recordString(displaySource, "height"));
  return {
    layout,
    ...(width ? { width } : {}),
    ...(height ? { height } : {})
  };
}

function normalizeAppSurfaceWindowLayout(value: string): AppSurfaceWindowLayout {
  const clean = String(value || "").trim().toLowerCase().replace(/[_\s]+/gu, "-");
  if (clean === "fullscreen" || clean === "full-screen") {
    return "full";
  }
  if (clean === "small" || clean === "mini") {
    return "compact";
  }
  if (clean === "bottom" || clean === "bottom-half" || clean === "default") {
    return "half";
  }
  return appSurfaceWindowLayouts.includes(clean as AppSurfaceWindowLayout)
    ? clean as AppSurfaceWindowLayout
    : "half";
}

function normalizeCssSize(value: string): string {
  const clean = String(value || "").trim().slice(0, 80);
  if (!clean) {
    return "";
  }
  if (/[{};<>@'"]/u.test(clean) || /url\s*\(/iu.test(clean)) {
    return "";
  }
  if (/^(?:\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|svh|svw|dvh|dvw)|(?:clamp|min|max|calc)\([A-Za-z0-9_.,+\-*/%() \t]+\))$/u.test(clean)) {
    return clean;
  }
  return "";
}

function normalizeAppSurfaceConnect(value: unknown): AppSurfaceConnectionIntent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const mode = recordString(value, "mode");
  if (!["inline", "same-origin", "remote-origin", "device-local", "kernel-proxy"].includes(mode)) {
    return undefined;
  }
  const target = normalizeTargetId(recordString(value, "target"));
  const path = normalizeDisplayText(recordString(value, "path"), 180);
  const origin = normalizeDisplayText(recordString(value, "origin"), 180);
  return {
    mode: mode as AppSurfaceConnectionMode,
    ...(target ? { target } : {}),
    ...(path ? { path } : {}),
    ...(origin ? { origin } : {})
  };
}

function normalizeInlineHtml(value: string, options: AppSurfaceInstallOptions): string {
  const html = String(value || "").trim();
  if (!html) {
    return "";
  }
  if (options.allowInlineHtml !== true) {
    throw new Error("Inline app surface requires allowInlineHtml");
  }
  const maxBytes = Math.max(1024, Math.min(options.maximumInlineHtmlBytes ?? 300_000, 1_000_000));
  if (new TextEncoder().encode(html).byteLength > maxBytes) {
    throw new Error("Inline app surface is too large");
  }
  return html;
}

function normalizeDisplayText(value: string, maxLength: number): string {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeTargetId(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/gu, "")
    .slice(0, 180);
}

function normalizeRevision(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/gu, "")
    .slice(0, 80);
}

function normalizeIsoTime(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function recordString(value: Record<string, unknown>, key: string): string {
  const item = value[key];
  return typeof item === "string" ? item : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCapabilityName(value: string): boolean {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 80
    && /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/u.test(value);
}

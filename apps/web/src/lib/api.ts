export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
}

export function absoluteApi(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  return resolveApiUrl(getApiBaseUrl(), path, origin);
}

export function resolveApiUrl(base: string, path: string, origin: string): string {
  const target = new URL(base, ensureTrailingSlash(origin));
  target.pathname = joinUrlPath(target.pathname, path);
  target.search = "";
  target.hash = "";
  return target.toString();
}

function joinUrlPath(basePath: string, path: string): string {
  const normalizedBase = basePath === "/" ? "" : stripTrailingSlash(basePath);
  const normalizedPath = stripLeadingSlash(path);
  return `${normalizedBase}/${normalizedPath}` || "/";
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

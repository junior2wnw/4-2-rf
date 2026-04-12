export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
}

export function absoluteApi(path: string): string {
  const base = getApiBaseUrl();

  if (base.startsWith("http://") || base.startsWith("https://")) {
    return new URL(path, ensureSlash(base)).toString();
  }

  if (typeof window !== "undefined") {
    return new URL(path, ensureSlash(`${window.location.origin}${normalizeRelativeBase(base)}`)).toString();
  }

  return new URL(path, "http://localhost:8080/").toString();
}

function ensureSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeRelativeBase(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

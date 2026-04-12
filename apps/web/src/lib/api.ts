export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
}

export function absoluteApi(path: string): string {
  return new URL(path, ensureSlash(getApiBaseUrl())).toString();
}

function ensureSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

import "server-only";

export function getInternalApiBaseUrl(): string {
  return process.env.INTERNAL_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
}

export function internalApi(path: string): string {
  return new URL(path, ensureSlash(getInternalApiBaseUrl())).toString();
}

export async function fetchInternalApi(
  path: string,
  init: RequestInit = {},
  options: { admin?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");

  if (options.admin) {
    const adminKey = process.env.KNOWLEDGE_ADMIN_API_KEY;
    if (!adminKey) {
      throw new Error("KNOWLEDGE_ADMIN_API_KEY is not configured on the web server.");
    }
    headers.set("x-admin-api-key", adminKey);
  }

  return fetch(internalApi(path), {
    ...init,
    headers,
    cache: "no-store",
  });
}

function ensureSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

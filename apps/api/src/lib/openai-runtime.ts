type OpenAiLikeError = {
  status?: number;
  code?: string;
  type?: string;
  message?: string;
};

export type OpenAiRuntimeIssue = "configuration" | "transient" | "unknown";

const configurationCodes = new Set([
  "invalid_api_key",
  "incorrect_api_key",
  "authentication_error",
  "model_not_found",
  "insufficient_quota",
  "billing_hard_limit_reached",
  "access_terminated",
]);

const transientCodes = new Set([
  "rate_limit_exceeded",
  "request_timeout",
  "server_error",
  "service_unavailable",
  "overloaded_error",
  "api_connection_error",
]);

export function classifyOpenAiRuntimeIssue(error: unknown): OpenAiRuntimeIssue {
  if (!error || typeof error !== "object") {
    return "unknown";
  }

  const candidate = error as OpenAiLikeError;
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const code = typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";
  const type = typeof candidate.type === "string" ? candidate.type.toLowerCase() : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

  if (
    status === 400 ||
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 404 ||
    configurationCodes.has(code) ||
    type === "authentication_error" ||
    message.includes("incorrect api key") ||
    message.includes("invalid api key") ||
    message.includes("api key") ||
    message.includes("model_not_found") ||
    message.includes("no such model") ||
    message.includes("insufficient quota")
  ) {
    return "configuration";
  }

  if (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (status !== null && status >= 500) ||
    transientCodes.has(code) ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("connection") ||
    message.includes("network") ||
    message.includes("temporarily unavailable") ||
    message.includes("rate limit")
  ) {
    return "transient";
  }

  return "unknown";
}

import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiUrl } from "../src/lib/api";

test("resolveApiUrl keeps the /api prefix for relative browser bases", () => {
  assert.equal(
    resolveApiUrl("/api", "/v1/chat/sessions", "https://4-2.xn--p1ai"),
    "https://4-2.xn--p1ai/api/v1/chat/sessions",
  );
});

test("resolveApiUrl keeps the /api prefix for absolute bases", () => {
  assert.equal(
    resolveApiUrl("https://4-2.xn--p1ai/api", "/v1/installers/manifest", "https://ignored.example"),
    "https://4-2.xn--p1ai/api/v1/installers/manifest",
  );
});

test("resolveApiUrl works for bare hosts without an api subpath", () => {
  assert.equal(
    resolveApiUrl("http://localhost:8080", "/healthz", "https://ignored.example"),
    "http://localhost:8080/healthz",
  );
});

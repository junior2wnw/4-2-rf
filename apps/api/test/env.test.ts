import { describe, expect, it } from "vitest";

import { parseEnv } from "../src/config/env.js";

describe("parseEnv", () => {
  it("fills defaults for local development", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://db",
      API_PUBLIC_BASE_URL: "http://localhost:8080",
      WEB_PUBLIC_BASE_URL: "http://localhost:3000",
      MEMORY_SIDECAR_URL: "http://localhost:8090",
      INSTALLER_BASE_URL: "http://localhost:8080/v1/installers",
    });

    expect(env.API_PORT).toBe(8080);
    expect(env.OPENAI_MODEL).toBe("gpt-5");
    expect(env.OPENAI_TIMEOUT_MS).toBe(60000);
    expect(env.MEMORY_SIDECAR_API_KEY).toBe("local-memory-sidecar-key");
    expect(env.KNOWLEDGE_ADMIN_API_KEY).toBe("local-admin-api-key");
  });
});

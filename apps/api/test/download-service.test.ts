import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { DownloadService } from "../src/services/download-service.js";

describe("DownloadService", () => {
  it("uses configured public URLs in the fallback manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "four-two-downloads-"));

    try {
      const service = new DownloadService(
        root,
        "https://example.com/api/v1/installers/",
        "https://example.com/api/",
      );

      const manifest = await service.loadManifest();

      expect(manifest.items).toHaveLength(6);
      expect(manifest.items[0]?.url).toBe(
        "https://example.com/api/v1/installers/4-2-agent-windows-amd64.zip",
      );
      expect(manifest.items[0]?.installCommand).toContain("--api-url https://example.com/api");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks path traversal when reading artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "four-two-downloads-"));
    const artifactsDir = join(root, "artifacts");
    const escapedFile = join(root, "outside.zip");
    await mkdir(artifactsDir);
    await writeFile(escapedFile, "not allowed");

    try {
      const service = new DownloadService(
        artifactsDir,
        "https://example.com/api/v1/installers",
        "https://example.com/api",
      );

      await expect(service.readArtifact("../outside.zip")).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type { DownloadManifest } from "@4-2/contracts";

export class DownloadService {
  public constructor(
    private readonly artifactsDir: string,
    private readonly installerBaseUrl: string,
    private readonly apiBaseUrl: string,
  ) {}

  public async loadManifest(): Promise<DownloadManifest> {
    const manifestPath = resolve(this.artifactsDir, "manifest.json");

    try {
      const raw = await readFile(manifestPath, "utf8");
      return JSON.parse(raw) as DownloadManifest;
    } catch {
      return this.buildFallbackManifest();
    }
  }

  public async readArtifact(filename: string): Promise<{ content: Buffer; contentType: string } | null> {
    const root = resolve(this.artifactsDir);
    const absolute = resolve(root, filename);
    const relativePath = relative(root, absolute);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return null;
    }

    try {
      await access(absolute);
      const content = await readFile(absolute);
      return {
        content,
        contentType: filename.endsWith(".zip")
          ? "application/zip"
          : filename.endsWith(".gz")
            ? "application/gzip"
            : "application/octet-stream",
      };
    } catch {
      return null;
    }
  }

  private buildFallbackManifest(): DownloadManifest {
    const generatedAt = new Date().toISOString();
    const items = [
      buildManifestItem(this.installerBaseUrl, this.apiBaseUrl, "windows", "amd64", "zip"),
      buildManifestItem(this.installerBaseUrl, this.apiBaseUrl, "windows", "arm64", "zip"),
      buildManifestItem(this.installerBaseUrl, this.apiBaseUrl, "linux", "amd64", "tar.gz"),
      buildManifestItem(this.installerBaseUrl, this.apiBaseUrl, "linux", "arm64", "tar.gz"),
      buildManifestItem(this.installerBaseUrl, this.apiBaseUrl, "macos", "amd64", "tar.gz"),
      buildManifestItem(this.installerBaseUrl, this.apiBaseUrl, "macos", "arm64", "tar.gz"),
    ];

    return { generatedAt, items };
  }
}

function buildManifestItem(
  installerBaseUrl: string,
  apiBaseUrl: string,
  platform: "windows" | "macos" | "linux",
  arch: "amd64" | "arm64",
  archiveType: "zip" | "tar.gz",
) {
  const filename = `4-2-agent-${platform}-${arch}.${archiveType}`;
  const normalizedInstallerBaseUrl = trimTrailingSlash(installerBaseUrl);
  const normalizedApiBaseUrl = trimTrailingSlash(apiBaseUrl);

  return {
    platform,
    arch,
    filename,
    installCommand:
      platform === "windows"
        ? `$installRoot = Join-Path $env:LOCALAPPDATA '4-2'; Expand-Archive -LiteralPath ./${filename} -DestinationPath $installRoot -Force; & (Join-Path $installRoot '4-2-agent.exe') install --api-url ${normalizedApiBaseUrl} --scope user --enrollment-token <token-from-site>`
        : `tar -xzf ./${filename} && ./4-2-agent install --api-url ${normalizedApiBaseUrl} --scope user --enrollment-token <token-from-site>`,
    sha256: sha256Hex(`fallback-${platform}-${arch}`),
    url: `${normalizedInstallerBaseUrl}/${filename}`,
    notes: buildNotes(platform),
  };
}

function buildNotes(platform: "windows" | "macos" | "linux"): string[] {
  const base = [
    "Default install scope is user, not system.",
    "Elevation is a separate explicit step and is never requested silently.",
  ];

  if (platform === "windows") {
    return [
      ...base,
      "Uses Startup-folder autostart for user installs and Task Scheduler only for explicit system scope.",
    ];
  }

  if (platform === "macos") {
    return [
      ...base,
      "Uses launchd with LaunchAgent by default; LaunchDaemon only on explicit elevated install.",
    ];
  }

  return [...base, "Uses systemd user services by default; system-wide mode requires explicit sudo."];
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function trimTrailingSlash(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

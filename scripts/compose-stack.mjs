#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const deployDir = resolve(repoRoot, "deploy");
const envFile = resolve(repoRoot, ".env");
const composeFile = resolve(deployDir, "compose.dev.yml");
const passthrough = process.argv.slice(2);

if (!existsSync(composeFile)) {
  console.error(`compose file not found: ${composeFile}`);
  process.exit(1);
}

if (passthrough.length === 0) {
  console.error("usage: node scripts/compose-stack.mjs <docker compose args>");
  console.error("example: node scripts/compose-stack.mjs up -d --build");
  console.error(
    "example: node scripts/compose-stack.mjs --profile build run --rm agent-builder",
  );
  process.exit(1);
}

const dockerArgs = ["compose"];

if (existsSync(envFile)) {
  dockerArgs.push("--env-file", "../.env");
} else {
  console.error("warning: .env not found in repo root; compose defaults will be used");
}

dockerArgs.push("-f", "compose.dev.yml", ...passthrough);

const child = spawn(process.platform === "win32" ? "docker.exe" : "docker", dockerArgs, {
  cwd: deployDir,
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(`failed to start docker compose: ${error.message}`);
  process.exit(1);
});

child.once("close", (code) => {
  process.exit(code ?? 1);
});

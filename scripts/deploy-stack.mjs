#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const composeScript = resolve(scriptDir, "compose-stack.mjs");

const run = (args) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [composeScript, ...args], {
      stdio: "inherit",
    });

    child.once("error", rejectPromise);
    child.once("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`compose command failed: ${args.join(" ")}`));
    });
  });

const main = async () => {
  const skipAgentBuilder = process.argv.includes("--skip-agent-builder");

  if (!skipAgentBuilder) {
    console.log("\n==> Building agent artifacts");
    await run(["--profile", "build", "run", "--build", "--rm", "agent-builder"]);
  }

  for (const service of ["memory-sidecar", "api", "web"]) {
    console.log(`\n==> Building ${service} image`);
    await run(["build", service]);
  }

  console.log("\n==> Starting stack");
  await run(["up", "-d"]);

  console.log("\n==> Current service status");
  await run(["ps"]);
};

main().catch((error) => {
  console.error(`deploy failed: ${error.message}`);
  process.exit(1);
});

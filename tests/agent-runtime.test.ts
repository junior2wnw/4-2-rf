import test from "node:test";
import assert from "node:assert/strict";
import {
  agentRuntimeCapabilityName,
  agentRuntimePermission,
  agentRuntimeRequiresConfirmation,
  agentRuntimeRiskForCapability,
  buildAgentRuntimeManifest,
  defaultAgentRuntimeCapabilities,
  normalizeAgentRuntimeId
} from "../src/index.js";

test("agent runtime normalizes ids and permissions", () => {
  assert.equal(normalizeAgentRuntimeId("  User PC Runtime  "), "user-pc-runtime");
  assert.equal(agentRuntimeCapabilityName("Transaction", "Submit"), "transaction.submit");
  assert.equal(
    agentRuntimePermission("User PC", "transaction.submit"),
    "agent.call:user-pc/transaction.submit"
  );
});

test("agent runtime risk model protects transaction and os actions", () => {
  assert.equal(agentRuntimeRiskForCapability("screen.capture"), "low");
  assert.equal(agentRuntimeRiskForCapability("filesystem.write"), "high");
  assert.equal(agentRuntimeRiskForCapability("transaction.submit"), "critical");
  assert.equal(agentRuntimeRiskForCapability("os.reinstall"), "critical");
  assert.equal(agentRuntimeRequiresConfirmation("transaction.submit"), true);
  assert.equal(agentRuntimeRequiresConfirmation("browser.open"), false);
});

test("agent runtime manifest is small and adapter neutral", () => {
  const capabilities = defaultAgentRuntimeCapabilities();
  const manifest = buildAgentRuntimeManifest({
    runtimeId: "Soty Agent",
    entrypoint: "computer",
    capabilities
  });

  assert.equal(manifest.schema, "trustlink.agent-runtime.v1");
  assert.equal(manifest.runtimeId, "soty-agent");
  assert.equal(manifest.jobModel, "durable-jobs");
  assert.equal(manifest.proofModel, "structured-proof");
  assert.equal(manifest.adapterModel, "capability-adapters");
  assert.equal(manifest.capabilities.some((item) => item.family === "app"), true);
  assert.equal(manifest.capabilities.some((item) => item.family === "transaction"), true);
  assert.equal(manifest.capabilities.some((item) => item.family === "os"), true);
});

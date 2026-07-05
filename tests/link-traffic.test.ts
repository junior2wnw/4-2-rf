import test from "node:test";
import assert from "node:assert/strict";
import {
  agentRuntimeRequiresConfirmation,
  agentRuntimeRiskForCapability,
  buildLinkTrafficGrant,
  capabilitiesAllowLinkTraffic,
  linkControlCapability,
  linkTrafficExitCapability,
  linkTrafficGrantCapabilities,
  linkTrafficModeFromCapabilities,
  linkTrafficProxyCapability,
  linkTrafficRequiresConfirmation,
  linkTrafficSchema,
  linkTrafficSystemCapability,
  normalizeLinkTrafficTarget
} from "../src/index.js";

test("link traffic grants stay explicit and capability scoped", () => {
  assert.deepEqual(linkTrafficGrantCapabilities(false), [linkControlCapability]);
  assert.deepEqual(linkTrafficGrantCapabilities(true), [
    linkControlCapability,
    linkTrafficExitCapability,
    linkTrafficProxyCapability
  ]);
  assert.deepEqual(linkTrafficGrantCapabilities(true, "system"), [
    linkControlCapability,
    linkTrafficExitCapability,
    linkTrafficSystemCapability
  ]);

  const grant = buildLinkTrafficGrant({ enabled: true, mode: "proxy", updatedAt: "2026-07-06T00:00:00.000Z" });
  assert.equal(grant.schema, linkTrafficSchema);
  assert.equal(grant.policy, "explicit-link-grant-only");
  assert.equal(capabilitiesAllowLinkTraffic(grant.capabilities), true);
  assert.equal(linkTrafficModeFromCapabilities(grant.capabilities), "proxy");
  assert.equal(linkTrafficModeFromCapabilities([linkTrafficExitCapability, linkTrafficSystemCapability]), "system");
  assert.equal(linkTrafficRequiresConfirmation(grant.capabilities), true);
});

test("link traffic target normalization is bounded and adapter neutral", () => {
  const target = normalizeLinkTrafficTarget({
    id: "room-1",
    label: "Phone",
    hostDeviceId: "dev-phone",
    deviceIds: ["dev-phone", "", "dev-extra"],
    exit: true,
    mode: "system",
    status: "available",
    adapter: "agent-fetch-proxy-v1",
    share: false
  });

  assert.equal(target?.id, "room-1");
  assert.equal(target?.exit, true);
  assert.equal(target?.mode, "system");
  assert.equal(target?.status, "available");
  assert.deepEqual(target?.deviceIds, ["dev-phone", "dev-extra"]);
  assert.equal(target?.adapter, "agent-fetch-proxy-v1");
  assert.equal(normalizeLinkTrafficTarget({ id: "" }), null);
});

test("agent runtime policy treats traffic as high-risk and confirmable", () => {
  assert.equal(agentRuntimeRiskForCapability("traffic.use"), "high");
  assert.equal(agentRuntimeRequiresConfirmation("traffic.exit"), true);
});

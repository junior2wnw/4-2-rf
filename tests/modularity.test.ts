import test from "node:test";
import assert from "node:assert/strict";
import {
  TrustStore,
  acceptPairingInvite,
  createDeviceIdentity,
  createPairingInvite,
  parsePairingInvite,
  pairingInviteSummary,
  serializePairingInvite,
  verifyPairingInvite
} from "../src/index.js";
import { NodeTrustLinkCrypto } from "../src/platform/node-crypto.js";

const crypto = new NodeTrustLinkCrypto();

test("pairing invite round trip creates a trust record", async () => {
  const a = await createDeviceIdentity(crypto, "A");
  const bTrust = TrustStore.empty();
  const invite = await createPairingInvite(crypto, a, {
    requestedPermissions: ["stream.write"],
    offeredPermissions: ["stream.write", "stream.read"]
  });

  const decoded = parsePairingInvite(serializePairingInvite(invite));
  const record = await acceptPairingInvite(crypto, bTrust, decoded, {
    approvedBy: "B:user"
  });

  assert.equal(await verifyPairingInvite(crypto, decoded), true);
  assert.equal(record.peer.id, a.id);
  assert.deepEqual(record.permissions, ["stream.read", "stream.write"]);
});

test("pairing summary is display-safe and renderer-agnostic", async () => {
  const identity = await createDeviceIdentity(crypto, "A");
  const invite = await createPairingInvite(crypto, identity, {
    requestedPermissions: ["stream.write"],
    offeredPermissions: ["stream.write"]
  });

  const summary = pairingInviteSummary(invite);

  assert.equal(summary.from, "A");
  assert.equal(typeof summary.fingerprint, "string");
  assert.ok(serializePairingInvite(invite).startsWith("trustlink:v1:pair:"));
});

test("kernel index is platform-neutral", async () => {
  const module = await import("../src/index.js");
  assert.equal("NodeTrustLinkCrypto" in module, false);
  assert.equal("createByteEnvelope" in module, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  LinkSpace,
  TrustStore,
  byteEnvelopePayload,
  createByteEnvelope,
  createDeviceIdentity,
  createStateSyncPlan,
  establishTrustedSession,
  manualEndpoint,
  PermissionPolicy,
  rankPathCandidates,
  StaticDiscoveryProvider,
  TokenBucket,
  toPublicIdentity
} from "../src/index.js";
import { NodeTrustLinkCrypto } from "../src/platform/node-crypto.js";
import { readUtf8, utf8 } from "../src/utils/encoding.js";

const crypto = new NodeTrustLinkCrypto();

test("pairing requires explicit trust before a session can start", async () => {
  const a = await createDeviceIdentity(crypto, "A");
  const b = await createDeviceIdentity(crypto, "B");
  const aTrust = TrustStore.empty();
  const bTrust = TrustStore.empty();

  await assert.rejects(() => establishTrustedSession(crypto, a, aTrust, b, bTrust), /Unknown peer/);
});

test("trusted devices exchange arbitrary encrypted bytes", async () => {
  const a = await createDeviceIdentity(crypto, "A");
  const b = await createDeviceIdentity(crypto, "B");
  const aTrust = TrustStore.empty();
  const bTrust = TrustStore.empty();

  aTrust.addTrustedPeer(toPublicIdentity(b), ["stream.write"], {
    accepted: true,
    approvedBy: "A:user"
  });
  bTrust.addTrustedPeer(toPublicIdentity(a), ["stream.write"], {
    accepted: true,
    approvedBy: "B:user"
  });

  const { initiatorSession, responderSession } = await establishTrustedSession(crypto, a, aTrust, b, bTrust);
  const payload = new Uint8Array([0, 1, 2, 253, 254, 255]);
  const frame = await initiatorSession.seal(payload, utf8("binary-demo"));

  assert.deepEqual(await responderSession.open(frame, utf8("binary-demo")), payload);
});

test("revoked trust blocks future sessions", async () => {
  const a = await createDeviceIdentity(crypto, "A");
  const b = await createDeviceIdentity(crypto, "B");
  const aTrust = TrustStore.empty();
  const bTrust = TrustStore.empty();

  aTrust.addTrustedPeer(toPublicIdentity(b), ["stream.write"], {
    accepted: true,
    approvedBy: "A:user"
  });
  bTrust.addTrustedPeer(toPublicIdentity(a), ["stream.write"], {
    accepted: true,
    approvedBy: "B:user"
  });
  bTrust.revoke(a.id);

  await assert.rejects(() => establishTrustedSession(crypto, a, aTrust, b, bTrust), /trust is inactive/);
});

test("permission policy allows exact and resource-scoped grants", () => {
  const policy = new PermissionPolicy([
    "stream.write",
    "api.call:/health",
    "events.subscribe:*"
  ]);

  assert.equal(policy.allows({ channel: "stream", action: "write" }), true);
  assert.equal(policy.allows({ channel: "api", action: "call", resource: "/health" }), true);
  assert.equal(policy.allows({ channel: "api", action: "call", resource: "/admin" }), false);
  assert.equal(policy.allows({ channel: "events", action: "subscribe", resource: "link" }), true);
});

test("byte envelopes preserve format metadata without understanding payloads", () => {
  const envelope = createByteEnvelope({
    streamId: "crdt-doc",
    seq: 7,
    contentType: "application/octet-stream",
    format: "yjs/update-v1",
    payload: utf8("opaque update")
  });

  assert.equal(envelope.format, "yjs/update-v1");
  assert.equal(readUtf8(byteEnvelopePayload(envelope)), "opaque update");
});

test("path engine prefers local low-latency paths", () => {
  const ranked = rankPathCandidates([
    {
      id: "forwarded",
      kind: "forwarder.custom",
      endpoint: "forward://example",
      latencyMs: 120,
      lossPct: 1,
      estimatedBandwidthMbps: 10,
      metered: false,
      forwarded: true,
      local: false,
      batteryCost: "medium",
      policyAllowed: true
    },
    {
      id: "local",
      kind: "any.local.transport",
      endpoint: "local://peer",
      traits: ["low-latency"],
      latencyMs: 5,
      lossPct: 0,
      estimatedBandwidthMbps: 100,
      metered: false,
      forwarded: false,
      local: true,
      batteryCost: "low",
      policyAllowed: true
    }
  ]);

  assert.equal(ranked[0]?.id, "local");
});

test("discovery returns only matching non-expired endpoints", async () => {
  const provider = new StaticDiscoveryProvider([
    manualEndpoint({
      peerId: "a",
      endpoint: "memory://a",
      transport: "memory.frame",
      source: "manual",
      capabilities: ["trustlink.stream.v1"]
    }),
    manualEndpoint({
      peerId: "b",
      endpoint: "custom://b",
      transport: "custom.transport",
      source: "manual",
      capabilities: ["trustlink.stream.v1"]
    })
  ]);

  const endpoints = await provider.discover("a");
  assert.equal(endpoints.length, 1);
  assert.equal(endpoints[0]?.peerId, "a");
});

test("state sync asks for missing durable work", () => {
  const plan = createStateSyncPlan(
    {
      streamId: "s1",
      deliveredSeq: 2,
      durableMessageIds: ["m1"],
      resumableTransferIds: []
    },
    {
      streamId: "s1",
      deliveredSeq: 5,
      durableMessageIds: ["m1", "m2"],
      resumableTransferIds: ["t1"]
    }
  );

  assert.equal(plan.requestFromSeq, 3);
  assert.deepEqual(plan.replayDurableMessageIds, ["m2"]);
  assert.deepEqual(plan.resumeTransferIds, ["t1"]);
});

test("token bucket denies bursts above capacity", () => {
  const bucket = new TokenBucket(2, 1);

  assert.equal(bucket.take().allowed, true);
  assert.equal(bucket.take().allowed, true);
  assert.equal(bucket.take().allowed, false);
});

test("link space keeps every member as ordinary trusted pairs", async () => {
  const a = await createDeviceIdentity(crypto, "A");
  const b = await createDeviceIdentity(crypto, "B");
  const c = await createDeviceIdentity(crypto, "C");

  const space = LinkSpace.create("Lab", toPublicIdentity(a), ["stream.read"]);
  space.addMember(toPublicIdentity(b), ["stream.write"]);
  const snapshot = space.addMember(toPublicIdentity(c), ["stream.write"]);

  assert.equal(snapshot.members.length, 3);
  assert.equal(snapshot.pairs.length, 3);
  assert.equal(space.pairBetween(a.id, b.id).state, "ready");
  assert.equal(space.pairBetween(a.id, c.id).state, "ready");
  assert.equal(space.pairBetween(b.id, c.id).state, "ready");
});

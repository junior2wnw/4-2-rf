import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeviceIdentity,
  LinkSpace,
  createStateSyncPlan,
  establishTrustedSession,
  fileChunkEnvelope,
  missingChunks,
  manualEndpoint,
  PermissionPolicy,
  planFileTransfer,
  createFileChunk,
  rankPathCandidates,
  StaticDiscoveryProvider,
  textMessage,
  TokenBucket,
  toPublicIdentity,
  TrustStore
} from "../src/index.js";

test("pairing requires explicit trust before a session can start", () => {
  const a = createDeviceIdentity("A");
  const b = createDeviceIdentity("B");
  const aTrust = TrustStore.empty();
  const bTrust = TrustStore.empty();

  assert.throws(() => establishTrustedSession(a, aTrust, b, bTrust), /Unknown peer/);
});

test("trusted devices establish matching encrypted sessions", () => {
  const a = createDeviceIdentity("A");
  const b = createDeviceIdentity("B");
  const aTrust = TrustStore.empty();
  const bTrust = TrustStore.empty();

  aTrust.addTrustedPeer(toPublicIdentity(b), ["messages.send"], {
    accepted: true,
    approvedBy: "A:user"
  });
  bTrust.addTrustedPeer(toPublicIdentity(a), ["messages.send"], {
    accepted: true,
    approvedBy: "B:user"
  });

  const { initiatorSession, responderSession } = establishTrustedSession(a, aTrust, b, bTrust);
  const envelope = textMessage("hello trusted peer");
  const frame = initiatorSession.seal(JSON.stringify(envelope), envelope.msgId);

  assert.equal(responderSession.openUtf8(frame, envelope.msgId), JSON.stringify(envelope));
});

test("revoked trust blocks future sessions", () => {
  const a = createDeviceIdentity("A");
  const b = createDeviceIdentity("B");
  const aTrust = TrustStore.empty();
  const bTrust = TrustStore.empty();

  aTrust.addTrustedPeer(toPublicIdentity(b), ["messages.send"], {
    accepted: true,
    approvedBy: "A:user"
  });
  bTrust.addTrustedPeer(toPublicIdentity(a), ["messages.send"], {
    accepted: true,
    approvedBy: "B:user"
  });
  bTrust.revoke(a.id);

  assert.throws(() => establishTrustedSession(a, aTrust, b, bTrust), /trust is inactive/);
});

test("permission policy allows exact and resource-scoped grants", () => {
  const policy = new PermissionPolicy([
    "messages.send",
    "api.call:/health",
    "events.subscribe:*"
  ]);

  assert.equal(policy.allows({ channel: "messages", action: "send" }), true);
  assert.equal(policy.allows({ channel: "api", action: "call", resource: "/health" }), true);
  assert.equal(policy.allows({ channel: "api", action: "call", resource: "/admin" }), false);
  assert.equal(policy.allows({ channel: "events", action: "subscribe", resource: "link" }), true);
});

test("file chunks carry resume metadata", () => {
  const plan = planFileTransfer("transfer_1", "data.bin", 10, 4);
  const chunk = createFileChunk(plan, 1, Buffer.from("test"));
  const envelope = fileChunkEnvelope(chunk);

  assert.equal(plan.totalChunks, 3);
  assert.equal(envelope.delivery.resume, true);
  assert.deepEqual(missingChunks(plan.totalChunks, [0, 2]), [1]);
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
      capabilities: ["messages"]
    }),
    manualEndpoint({
      peerId: "b",
      endpoint: "custom://b",
      transport: "custom.transport",
      source: "manual",
      capabilities: ["messages"]
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

test("link space makes the same pair link for every member", () => {
  const a = createDeviceIdentity("A");
  const b = createDeviceIdentity("B");
  const c = createDeviceIdentity("C");

  const space = LinkSpace.create("Lab", toPublicIdentity(a), ["events.sync"]);
  space.addMember(toPublicIdentity(b), ["messages.send"]);
  const snapshot = space.addMember(toPublicIdentity(c), ["metrics.write"]);

  assert.equal(snapshot.members.length, 3);
  assert.equal(snapshot.pairs.length, 3);
  assert.equal(space.pairBetween(a.id, b.id).state, "ready");
  assert.equal(space.pairBetween(a.id, c.id).state, "ready");
  assert.equal(space.pairBetween(b.id, c.id).state, "ready");
});

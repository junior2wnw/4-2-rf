import test from "node:test";
import assert from "node:assert/strict";
import {
  LinkSpace,
  PermissionPolicy,
  StaticDiscoveryProvider,
  TokenBucket,
  TrustStore,
  acceptHandshake,
  cleanTrustLabel,
  byteEnvelopePayload,
  createByteEnvelope,
  createCompactJoinCode,
  createDeviceIdentity,
  createHandshakeOffer,
  createRoomAuth,
  createStateSyncPlan,
  createTrustLinkRoom,
  createWebJoinKeyPair,
  createWebRoomAuth,
  establishTrustedSession,
  exportWebJoinPublicKey,
  manualEndpoint,
  openBytesWithRoomSecret,
  openRoomSecretFromWebJoin,
  parseCompactJoinCode,
  parsePermission,
  parseSealedFrame,
  rankPathCandidates,
  sealBytesWithRoomSecret,
  sealRoomSecretForWebJoin,
  serializeSealedFrame,
  toPublicIdentity,
  validateByteEnvelope,
  trustLinkStreamCapability
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
  const { initiatorSession, responderSession } = await trustedSessions();
  const payload = new Uint8Array([0, 1, 2, 253, 254, 255]);
  const frame = await initiatorSession.seal(payload, utf8("binary"));

  assert.deepEqual(await responderSession.open(frame, utf8("binary")), payload);
  assert.equal(initiatorSession.allows({ channel: "stream", action: "write" }), true);
  assert.equal(initiatorSession.allows({ channel: "device", action: "control" }), false);
  assert.throws(() => initiatorSession.require({ channel: "device", action: "control" }), /Permission denied/);
});

test("sessions reject replay, gaps, wrong context, and oversized frames", async () => {
  const { initiatorSession, responderSession } = await trustedSessions({ maxPlaintextBytes: 4 });
  const first = await initiatorSession.seal(new Uint8Array([1, 2, 3, 4]), utf8("ctx"));

  assert.deepEqual(await responderSession.open(first, utf8("ctx")), new Uint8Array([1, 2, 3, 4]));
  await assert.rejects(() => responderSession.open(first, utf8("ctx")), /sequence/);
  await assert.rejects(() => initiatorSession.seal(new Uint8Array([1, 2, 3, 4, 5])), /frame limit/);

  const next = await initiatorSession.seal(new Uint8Array([5]), utf8("right"));
  await assert.rejects(() => responderSession.open(next, utf8("wrong")));
});

test("sealed frame codec round trips and validates limits", async () => {
  const { initiatorSession } = await trustedSessions();
  const first = await initiatorSession.seal(utf8("one"));
  const second = await initiatorSession.seal(utf8("two"));
  const encoded = serializeSealedFrame(first);

  assert.deepEqual(parseSealedFrame(encoded), first);
  assert.notEqual(first.nonce, second.nonce);
  assert.equal(first.seq, 1);
  assert.equal(second.seq, 2);
  assert.throws(() => parseSealedFrame("trustlink:v1:frame:@@@"), /base64url/);
  assert.throws(() => parseSealedFrame(encoded, { maxSerializedBytes: 1 }), /exceeds/);
  assert.throws(() => serializeSealedFrame(first, { maxCiphertextBytes: 1 }), /exceeds/);
});

test("handshake checks freshness and shared capabilities", async () => {
  const a = await createDeviceIdentity(crypto, "A");
  const b = await createDeviceIdentity(crypto, "B");
  const bTrust = TrustStore.empty();
  bTrust.addTrustedPeer(toPublicIdentity(a), ["stream.write"], {
    accepted: true,
    approvedBy: "B:user"
  });

  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const pending = await createHandshakeOffer(crypto, a, toPublicIdentity(b), {
    now: () => now,
    ttlMs: 1000,
    capabilities: [trustLinkStreamCapability]
  });

  await assert.rejects(
    () => acceptHandshake(crypto, b, bTrust, pending.offer, {
      now: () => now + 2000,
      ttlMs: 1000,
      capabilities: [trustLinkStreamCapability]
    }),
    /outside the allowed window/
  );
  await assert.rejects(
    () => acceptHandshake(crypto, b, bTrust, pending.offer, {
      now: () => now,
      ttlMs: 1000,
      capabilities: ["custom.capability"]
    }),
    /No shared/
  );
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
  assert.equal(new PermissionPolicy(["*.*"]).allows({ channel: "device", action: "control", resource: "screen" }), true);
  assert.throws(() => new PermissionPolicy(["api.call:"]), /Invalid permission resource/);
  assert.deepEqual(parsePermission("device.control:*"), {
    raw: "device.control:*",
    channel: "device",
    action: "control",
    resource: "*"
  });
});

test("trust permissions can be raised or lowered for future sessions", async () => {
  const a = await createDeviceIdentity(crypto, "A");
  const b = await createDeviceIdentity(crypto, "B");
  const aTrust = TrustStore.empty();

  aTrust.addTrustedPeer(toPublicIdentity(b), ["text.send"], {
    accepted: true,
    approvedBy: "A:user"
  });

  assert.equal(aTrust.allows(b.id, { channel: "text", action: "send" }), true);
  assert.equal(aTrust.allows(b.id, { channel: "device", action: "control" }), false);

  aTrust.grantPermissions(b.id, ["device.control:*"]);
  assert.equal(aTrust.allows(b.id, { channel: "device", action: "control", resource: "screen" }), true);

  aTrust.updatePermissions(b.id, ["text.send"]);
  assert.equal(aTrust.allows(b.id, { channel: "device", action: "control", resource: "screen" }), false);
});

test("session grants can be lower than the trust record", async () => {
  const a = await createDeviceIdentity(crypto, "A");
  const b = await createDeviceIdentity(crypto, "B");
  const aTrust = TrustStore.empty();
  const bTrust = TrustStore.empty();

  aTrust.addTrustedPeer(toPublicIdentity(b), ["stream.write", "device.control:*"], {
    accepted: true,
    approvedBy: "A:user"
  });
  bTrust.addTrustedPeer(toPublicIdentity(a), ["stream.write", "device.control:*"], {
    accepted: true,
    approvedBy: "B:user"
  });

  const { initiatorSession, responderSession } = await establishTrustedSession(
    crypto,
    a,
    aTrust,
    b,
    bTrust,
    { grantPermissions: ["stream.write"], requestedPermissions: ["stream.write"] }
  );

  assert.equal(initiatorSession.allowsPeer({ channel: "stream", action: "write" }), true);
  assert.equal(initiatorSession.allowsPeer({ channel: "device", action: "control", resource: "screen" }), false);
  assert.equal(responderSession.allows({ channel: "stream", action: "write" }), true);
  assert.equal(responderSession.allows({ channel: "device", action: "control", resource: "screen" }), false);
});

test("byte envelopes preserve opaque payloads with bounded metadata", () => {
  const envelope = createByteEnvelope({
    streamId: "crdt-doc",
    seq: 7,
    contentType: "application/octet-stream",
    format: "yjs/update-v1",
    payload: utf8("opaque update")
  });

  assert.equal(envelope.format, "yjs/update-v1");
  assert.equal(readUtf8(byteEnvelopePayload(envelope)), "opaque update");
  assert.throws(() => validateByteEnvelope({ ...envelope, delivery: { mode: "exactly_once" } }), /idempotencyKey/);
  assert.throws(() => byteEnvelopePayload(envelope, { maxPayloadBytes: 2 }), /exceeds/);
  assert.throws(() => createByteEnvelope({
    streamId: "ttl",
    seq: 1,
    payload: utf8("x"),
    delivery: { ttlMs: 0 }
  }), /ttlMs/);
});

test("room helpers keep join codes compact and app-neutral", async () => {
  const room = createTrustLinkRoom({ label: "  Device   A  ", now: "2026-04-29T00:00:00.000Z" });
  const code = createCompactJoinCode(room.id, room.label);
  const parsed = parseCompactJoinCode(code);

  assert.equal(room.label, "Device A");
  assert.equal(cleanTrustLabel(""), ".");
  assert.equal(parsed.roomId, room.id);
  assert.equal(parsed.label, "Device A");
  assert.equal(
    await createRoomAuth(crypto, room, { namespace: "demo.room-auth.v1" }),
    await createRoomAuth(crypto, { id: room.id, secret: room.secret }, { namespace: "demo.room-auth.v1" })
  );
});

test("web crypto adapter pairs and opens room bytes", async () => {
  const room = createTrustLinkRoom({ label: "browser" });
  const requester = await createWebJoinKeyPair();
  const accepted = await sealRoomSecretForWebJoin(
    room.secret,
    await exportWebJoinPublicKey(requester),
    "host"
  );
  const openedSecret = await openRoomSecretFromWebJoin(requester.privateKey, accepted);
  const sealed = await sealBytesWithRoomSecret(openedSecret, utf8("any bytes"));

  assert.equal(openedSecret, room.secret);
  assert.equal(readUtf8(await openBytesWithRoomSecret(room.secret, sealed.nonce, sealed.ciphertext)), "any bytes");
  assert.equal(await createWebRoomAuth(room), await createWebRoomAuth({ id: room.id, secret: room.secret }));
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

async function trustedSessions(options: Parameters<typeof establishTrustedSession>[5] = {}) {
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

  return establishTrustedSession(crypto, a, aTrust, b, bTrust, options);
}

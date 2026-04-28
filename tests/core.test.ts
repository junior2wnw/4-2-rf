import test from "node:test";
import assert from "node:assert/strict";
import {
  LinkSpace,
  PermissionPolicy,
  TrustStore,
  byteEnvelopePayload,
  createByteEnvelope,
  createDeviceIdentity,
  createHandshakeOffer,
  establishTrustedSession,
  parseSealedFrame,
  serializeSealedFrame,
  toPublicIdentity,
  validateByteEnvelope,
  trustLinkStreamCapability,
  acceptHandshake
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

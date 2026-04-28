#!/usr/bin/env node
import {
  TrustStore,
  acceptPairingInvite,
  createByteEnvelope,
  createDeviceIdentity,
  createPairingInvite,
  establishTrustedSession,
  parsePairingInvite,
  serializePairingInvite,
  toPublicIdentity,
  byteEnvelopePayload
} from "./index.js";
import { NodeTrustLinkCrypto } from "./platform/node-crypto.js";
import { readUtf8, utf8 } from "./utils/encoding.js";

const command = process.argv[2] ?? "demo";

if (command === "demo") {
  await runDemo();
} else if (command === "doctor") {
  await runDoctor();
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Try: trustlink demo | doctor");
  process.exitCode = 1;
}

async function runDemo(): Promise<void> {
  const crypto = new NodeTrustLinkCrypto();
  const laptop = await createDeviceIdentity(crypto, "Laptop");
  const phone = await createDeviceIdentity(crypto, "Phone");
  const laptopTrust = TrustStore.empty();
  const phoneTrust = TrustStore.empty();

  const invite = await createPairingInvite(crypto, laptop, {
    requestedPermissions: ["stream.write"],
    offeredPermissions: ["stream.write", "stream.read"]
  });
  const encoded = serializePairingInvite(invite);
  await acceptPairingInvite(crypto, phoneTrust, parsePairingInvite(encoded), {
    approvedBy: "phone:local"
  });
  laptopTrust.addTrustedPeer(toPublicIdentity(phone), ["stream.write", "stream.read"], {
    accepted: true,
    approvedBy: "laptop:local"
  });

  const { initiatorSession, responderSession } = await establishTrustedSession(
    crypto,
    laptop,
    laptopTrust,
    phone,
    phoneTrust
  );
  const envelope = createByteEnvelope({
    streamId: "stream_demo",
    seq: 1,
    payload: utf8("any bytes, any format"),
    contentType: "text/plain",
    format: "demo/plain"
  });
  const sealed = await initiatorSession.seal(utf8(JSON.stringify(envelope)), utf8(envelope.envelopeId));
  const opened = JSON.parse(await responderSession.openUtf8(sealed, envelope.envelopeId)) as typeof envelope;

  console.log(JSON.stringify({
    technology: "TrustLink Kernel",
    rule: "trusted identities exchange opaque encrypted byte streams",
    cryptoSuite: crypto.suite,
    devices: [
      { label: laptop.label, id: laptop.id, fingerprint: laptop.fingerprint },
      { label: phone.label, id: phone.id, fingerprint: phone.fingerprint }
    ],
    invite: {
      prefix: encoded.slice(0, "trustlink:v1:pair:".length),
      expiresAt: invite.payload.expiresAt
    },
    session: initiatorSession.snapshot(),
    delivered: readUtf8(byteEnvelopePayload(opened))
  }, null, 2));
}

async function runDoctor(): Promise<void> {
  const crypto = new NodeTrustLinkCrypto();
  const identity = await createDeviceIdentity(crypto, "Doctor");
  console.log(JSON.stringify({
    status: "ready",
    kernel: "identity + trust + pairing + secure sessions + byte envelopes",
    cryptoProvider: crypto.id,
    cryptoSuite: crypto.suite,
    identity: {
      id: identity.id,
      fingerprint: identity.fingerprint
    }
  }, null, 2));
}

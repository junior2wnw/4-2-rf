# TrustLink Kernel

TrustLink Kernel is a small universal core for consent-based encrypted byte
streams between trusted identities.

It is the narrow technology layer that lets higher-level systems answer:

```text
Who am I?
Who do I trust?
Can we open a fresh encrypted session?
Can I move these bytes with a delivery policy?
Can I recover without changing the application format?
```

Everything above that line is an adapter.

## Kernel Boundary

Kernel scope:

- device identity
- public trust records
- pairing invite serialization
- session handshake
- encrypted frames
- byte envelopes
- link spaces
- delivery and recovery metadata
- transport, storage, and crypto ports

Adapter scope:

- UI
- QR rendering
- concrete transport implementations
- application channels and protocols
- IndexedDB, SQLite, Keychain, TPM, or cloud storage implementations

## Payload Rule

Application payloads stay opaque to the kernel.

```ts
const envelope = createByteEnvelope({
  streamId: "shared-doc",
  seq: 1,
  payload: bytes,
  contentType: "application/octet-stream",
  format: "yjs/update-v1"
});
```

`format` and `contentType` are routing metadata for the application. The kernel
validates the envelope, encrypts bytes, opens bytes, and preserves delivery
metadata.

## Quick Start

```bash
pnpm install
pnpm check
pnpm doctor
```

Minimal Node example:

```ts
import {
  TrustStore,
  createByteEnvelope,
  createDeviceIdentity,
  establishTrustedSession,
  toPublicIdentity
} from "trustlink-kernel";
import { NodeTrustLinkCrypto } from "trustlink-kernel/dist/platform/node-crypto.js";

const crypto = new NodeTrustLinkCrypto();
const a = await createDeviceIdentity(crypto, "A");
const b = await createDeviceIdentity(crypto, "B");
const aTrust = TrustStore.empty();
const bTrust = TrustStore.empty();

aTrust.addTrustedPeer(toPublicIdentity(b), ["stream.write"], {
  accepted: true,
  approvedBy: "A"
});
bTrust.addTrustedPeer(toPublicIdentity(a), ["stream.write"], {
  accepted: true,
  approvedBy: "B"
});

const { initiatorSession, responderSession } = await establishTrustedSession(
  crypto,
  a,
  aTrust,
  b,
  bTrust
);

const envelope = createByteEnvelope({
  streamId: "any-stream",
  seq: 1,
  payload: new Uint8Array([1, 2, 3]),
  format: "custom/binary"
});

const sealed = await initiatorSession.seal(
  new TextEncoder().encode(JSON.stringify(envelope))
);
const opened = await responderSession.open(sealed);
```

## Design Principles

- The permanent identity key pins a device identity.
- Pairing is explicit and creates a revocable trust record.
- Every session uses fresh agreement keys.
- Transports move sealed frames only.
- Payloads are opaque bytes.
- Delivery semantics are metadata.
- Platform specifics are ports.

## Status

This branch is the cleaned kernel shape. The included Node crypto provider is a
reference adapter for tests and server-side usage. Browser, mobile, and
hardware-backed providers can implement the same `TrustLinkCrypto` port.

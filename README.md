# TrustLink Kernel

TrustLink Kernel is a small technology core for consent-based encrypted byte
streams between trusted identities.

It gives higher layers five primitives:

```text
identity
trust
pairing
permissions
encrypted session
opaque byte envelope
```

Everything else connects through ports.

## Core Boundary

Inside the kernel:

- device identity
- public trust records
- permission strings
- pairing invite serialization
- signed session handshake
- encrypted frame codec
- opaque byte envelopes
- pairwise link spaces
- crypto, transport, and storage ports

Outside the kernel:

- screens and flows
- visual invite renderers
- concrete network transports
- application channels
- large-object chunking
- platform key storage
- database adapters

## Payload Rule

Payloads stay opaque to the kernel. A higher layer chooses the format; the
kernel validates metadata, seals bytes, opens bytes, and keeps sequence rules.

```ts
const envelope = createByteEnvelope({
  streamId: "shared-doc",
  seq: 1,
  payload: bytes,
  contentType: "application/octet-stream",
  format: "custom/binary"
});
```

Large data should be split by an adapter into bounded byte envelopes. The
kernel is intentionally small and deterministic.

## Permission Rule

Trust is bounded by explicit grants. Each device keeps a local permission grant
for every peer. A session receives the current grants during handshake and
answers simple questions:

```ts
session.requireLocal({ channel: "stream", action: "write" });
session.requirePeer({ channel: "device", action: "control", resource: "screen" });
```

Permissions are plain strings:

```text
text.send
stream.write
file.read:/photos
device.control:screen
api.call:/health
*.*
```

Small scenarios can grant only one action. Larger scenarios can grant broader
rights intentionally. Raising or lowering trust permissions is a local decision,
and future sessions pick up the new grant.

## Quick Start

```bash
pnpm install
pnpm check
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
import { NodeTrustLinkCrypto } from "trustlink-kernel/platform/node";

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

## Security Shape

- stable device ids derive from public signing keys
- trust is local, explicit, revocable, and permission-scoped
- session permissions are negotiated from local trust records
- every session uses fresh agreement keys
- frame nonces derive from directional session material and sequence numbers
- frames are authenticated with session, direction, sequence, and context data
- replay and sequence gaps are rejected inside the session
- frame and envelope sizes are bounded by configuration
- platform crypto, storage, and transport stay replaceable

## Maturity

This repository now holds the kernel only. Before sensitive deployments, add
external cryptographic review, protocol test vectors, decoder fuzzing, adapter
conformance tests, and platform-backed private-key storage.

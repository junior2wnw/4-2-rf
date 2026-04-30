# TrustLink Kernel

TrustLink Kernel is a small technology core for consent-based encrypted byte
streams between trusted identities.

It gives higher layers a small set of primitives:

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
- room secrets and compact join codes
- opaque byte envelopes
- pairwise link spaces
- path ranking, discovery metadata, recovery plans, and rate limits
- crypto, transport, and storage ports

Outside the kernel:

- screens and flows
- visual invite renderers
- concrete network transports
- application channels
- large-object chunking
- platform key storage
- database adapters

## Module Shape

The package is a small SDK. Applications call the kernel methods and attach
their own UI, storage, and transport adapters around them.

```ts
import {
  createCompactJoinCode,
  createTrustLinkRoom,
  parseCompactJoinCode
} from "trustlink-kernel";
import {
  createWebJoinKeyPair,
  exportWebJoinPublicKey,
  openBytesWithRoomSecret,
  sealBytesWithRoomSecret,
  sealRoomSecretForWebJoin
} from "trustlink-kernel/platform/web";
```

`createTrustLinkRoom` creates an opaque room id and secret.
`createCompactJoinCode` produces the small QR payload. The web adapter can then
open an encrypted room secret and encrypt arbitrary byte arrays. The kernel
treats those bytes as opaque regardless of whether they are text, files, CRDT
updates, commands, telemetry, or any other format.

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
session.require({ channel: "stream", action: "write" });
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
pnpm doctor
pnpm demo
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

## License Shape

TrustLink Kernel is publicly visible source code under the TrustLink Kernel
Public Source License 1.0. It sits outside MIT, Apache, public domain, and
OSI-approved open source terms.

The license is designed to keep small use easy while protecting the creator:
once a company or covered offering reaches 10,000,000 RUB in trailing
twelve-month gross revenue, continued live commercial use requires a
signed commercial license with default economics of 7% attributable gross
revenue plus 5% fully diluted equity, unless Alik "Lord" Gaynetdinov signs
different terms.

## Maturity

This repository now holds the kernel only. Before sensitive deployments, add
external cryptographic review, protocol test vectors, decoder fuzzing, adapter
conformance tests, and platform-backed private-key storage.

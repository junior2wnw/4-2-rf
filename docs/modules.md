# Ports And Adapters

The kernel exposes ports. Higher-level systems provide adapters.

## Crypto

`TrustLinkCrypto` owns:

- random bytes
- hashing
- signing and verification
- temporary agreement keys
- key derivation
- authenticated encryption

The included Node provider is a reference adapter. Browser, native mobile,
hardware-backed, and embedded providers can implement the same interface.

## Storage

Storage adapters persist:

- local identity
- trust records
- link-space snapshots

Storage choices stay in adapters: IndexedDB, SQLite, Keychain, filesystem, TPM,
secure enclave, or managed databases.

## Transport

A transport adapter connects to its own endpoint type and sends sealed frames.

Examples of endpoint families:

- local process pipe
- local network channel
- datagram channel
- edge stream
- BLE
- USB
- server-side private stream

All of them move the same sealed frame shape.

## Application Channels

Application channels use byte envelopes for their own formats: RPC, CRDT,
presence, cursors, telemetry, streaming media, and custom protocols.

The kernel stays generic by treating those scenarios as permissions plus bytes:
`text.send`, `file.read:/path`, `api.call:/method`, `device.control:screen`,
or any namespace an adapter defines.

## App Surfaces

App surfaces are UI adapters over trusted links: mini apps, command panels,
embedded tools, widgets, and remote frontends. The kernel classifies
their connection mode (`same-origin`, `remote-origin`, `device-local`, or
`kernel-proxy`), normalizes ids, validates origins, extracts frame sources, and
derives capability permission strings. Shells still own catalogs,
buttons, layout, and concrete browser/native bridge code.

## Agent Runtime

Agent runtime is the installed local capability host for trusted devices. The
kernel describes capability families, risk, confirmation, durable job states,
proof, and permission strings. Device agents and shells provide concrete
adapters for operating systems, apps, local APIs, browser sessions, transaction
flows, and other host programs.

## Link Traffic

Link traffic is a permission and adapter contract for routing selected traffic
through a trusted peer. The kernel keeps it generic: explicit grants, capability
names, target shape, proxy/system modes, status, risk, and proof. Applications
decide how to ask for consent, and agents decide whether the concrete adapter is
a fetch proxy, a stream proxy, or a system route helper.

## Reliability Primitives

These modules stay in the kernel because they are technology primitives rather
than app behavior:

- `path` ranks candidate transports without owning any concrete transport;
- `discovery` normalizes endpoint discovery records and provider composition;
- `recovery` models reconnect, degraded, revoked, and resumable states;
- `state-sync` plans replay and resume gaps between stream checkpoints;
- `abuse-protection` provides local token-bucket rate decisions;
- `audit` records structured security and reliability events.

Applications may render, persist, transmit, or monetize these signals, but the
decision logic belongs here.

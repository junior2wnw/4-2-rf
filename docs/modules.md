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
hardware-backed, and embedded providers should implement the same interface.

## Storage

Storage adapters persist:

- local identity
- trust records
- link spaces
- recovery checkpoints
- durable outbox data

Storage choices stay in adapters: IndexedDB, SQLite, Keychain, filesystem, TPM,
or cloud databases.

## Transport

A transport adapter connects to an endpoint and sends sealed frames.

Adapter examples:

- edge stream
- direct data channel
- datagram transport
- local discovery
- BLE
- USB
- local process pipe

All of them move the same sealed frame shape.

## Application Channels

Application channels use byte envelopes for their own formats: RPC, CRDT,
presence, cursors, telemetry, streaming media, and custom protocols.

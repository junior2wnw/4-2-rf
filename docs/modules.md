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

# Ports And Adapters

The kernel exposes ports. Products provide adapters.

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

The kernel does not choose IndexedDB, SQLite, Keychain, filesystem, TPM, or a
cloud database.

## Transport

A transport adapter connects to an endpoint and sends sealed frames.

Possible adapters:

- WebSocket relay
- WebRTC data channel
- QUIC
- LAN discovery
- BLE
- USB
- local process pipe

All of them move the same sealed frame shape.

## Application Channels

Chat, files, RPC, CRDT, presence, cursors, telemetry, and streaming media are
application channels over byte envelopes. They do not belong in the kernel.

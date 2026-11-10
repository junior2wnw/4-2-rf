# Roadmap

The kernel should stay small. New work should either strengthen the universal
core or move into an adapter package.

## Kernel

- protocol test vectors
- signed link-space snapshots
- durable outbox checkpoint helpers
- revocation event format
- conformance tests for transport adapters
- WebCrypto reference provider

## Adapter Packages

- IndexedDB storage
- SQLite storage
- WebSocket relay transport
- WebRTC transport
- QR renderer and scanner helpers
- CRDT channel helpers
- file transfer channel helpers

## Rule

If a feature needs to understand application data, it is not kernel work.

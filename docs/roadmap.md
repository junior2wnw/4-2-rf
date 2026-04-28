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
- edge stream transport
- direct data channel transport
- QR renderer and scanner helpers
- CRDT channel helpers
- file transfer channel helpers

## Rule

Kernel work preserves bytes, trust, sessions, delivery metadata, and recovery
state. Format-specific behavior belongs in adapter packages.

# Roadmap

The kernel should stay small. New work should strengthen the universal core or
live in a separate adapter repository.

## Kernel

- protocol test vectors
- signed link-space snapshots
- revocation event format
- adapter conformance tests
- WebCrypto reference provider
- decoder fuzz corpus
- public API stability pass

## Adapter Repositories

- browser storage
- mobile storage
- hardware-backed key storage
- visual invite renderer
- concrete transport adapters
- CRDT channel helpers
- large-object channel helpers

## Rule

Kernel work preserves bytes, trust, sessions, envelopes, frame safety, and port
contracts. Format-specific behavior belongs in adapter repositories.

# Architecture

TrustLink Kernel has one job:

```text
Move opaque bytes between trusted identities over fresh encrypted sessions.
```

## Layers

1. Identity
   A device identity is a public signing key plus stable derived id. The private
   key stays in a platform-owned store.

2. Trust
   A peer becomes trusted only after local consent. Trust is revocable and
   permission-scoped.

3. Pairing
   An invite is a signed, serializable payload. QR, NFC, links, copy/paste, and
   local discovery can all carry the same invite string.

4. Session
   A trusted pair performs a signed handshake, creates temporary agreement keys,
   derives directional keys, and encrypts frames.

5. Byte Envelope
   A byte envelope carries `Uint8Array` payloads plus opaque application
   metadata such as `contentType` and `format`.

6. Link Space
   A group is represented as a versioned context over ordinary pairwise trusted
   links. The kernel does not need a special group transport.

7. Recovery
   Checkpoints describe delivered sequence numbers, durable ids, and resumable
   stream ids. Applications decide what replay means for their format.

8. Ports
   Crypto, storage, discovery, and transport are interfaces. Node, browser,
   mobile, LAN, relay, hardware, and embedded implementations live outside the
   kernel.

## Non-Goals

- no UI primitives
- no QR rendering
- no chat semantics
- no file semantics
- no account system
- no mandatory transport
- no platform-specific private-key storage in the core path

## Result

The same kernel can sit under a PWA chat, a CRDT sync engine, a device relay,
an IoT command channel, a game state stream, or server-to-server private pipes.

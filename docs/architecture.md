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
   A link space is represented as a versioned context over ordinary pairwise
   trusted links.

7. Recovery
   Checkpoints describe delivered sequence numbers, durable ids, and resumable
   stream ids. Applications decide what replay means for their format.

8. Ports
   Crypto, storage, discovery, and transport are interfaces. Node, browser,
   mobile, hardware, and embedded implementations connect through adapters.

## Result

The same kernel can sit under document sync, device control, telemetry,
collaboration, media, embedded systems, or server-to-server private streams.

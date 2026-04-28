# Architecture

TrustLink Kernel has one job:

```text
Move opaque bytes between trusted identities over fresh encrypted sessions.
```

## Layers

1. Identity
   A device identity is a public signing key plus a stable derived id. Private
   key material belongs in platform storage.

2. Trust
   A peer becomes trusted through local consent. Trust is revocable and
   permission-scoped.

3. Permissions
   Permissions are small strings such as `text.send`, `api.call:/health`, or
   `device.control:screen`. Trust records define the maximum local grant.

4. Pairing
   An invite is a signed serializable payload. Any renderer or handoff channel
   can carry the same invite string.

5. Session
   A trusted pair performs a signed handshake, creates temporary agreement keys,
   derives directional keys and nonce seeds, negotiates session grants, then
   seals frames.

6. Frame Codec
   A sealed frame is a bounded, versioned, authenticated container that any
   transport can move.

7. Byte Envelope
   A byte envelope carries `Uint8Array` payloads plus application metadata such
   as `contentType` and `format`.

8. Link Space
   A link space is a versioned context over ordinary pairwise trusted links.

9. Ports
   Crypto, storage, and transport are interfaces. Node, browser, mobile,
   hardware, embedded, and server implementations connect through adapters.

## Result

The same kernel can sit under document sync, device control, telemetry,
collaboration, media, embedded systems, or server-to-server private streams.

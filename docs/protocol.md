# Protocol

## Pairing

```text
A creates a signed invite.
B verifies A identity and invite signature.
B stores A as trusted after local consent.
A stores B as trusted through its own consent path.
Future sessions reconnect without repeating pairing.
```

An invite is renderer-agnostic:

```text
trustlink:v1:pair:<base64url stable-json signed payload>
```

QR codes, deep links, NFC tags, short links, and local handoff screens can carry
that string.

## Handshake

```text
offer:
  permanent public identity
  temporary agreement public key
  capabilities
  crypto suite
  identity signature

answer:
  permanent public identity
  temporary agreement public key
  offer hash
  capabilities
  crypto suite
  identity signature
```

The permanent key proves identity. The temporary agreement key creates fresh
directional session keys. Reconnect means a new session.

## Sealed Frame

```json
{
  "v": 1,
  "sessionId": "ses_...",
  "fromDeviceId": "dev_...",
  "toDeviceId": "dev_...",
  "seq": 1,
  "nonce": "...",
  "ciphertext": "...",
  "tag": "..."
}
```

Transports move sealed frames and stay payload-format agnostic.

## Byte Envelope

```json
{
  "v": 1,
  "envelopeId": "env_...",
  "streamId": "shared-doc",
  "seq": 7,
  "contentType": "application/octet-stream",
  "format": "yjs/update-v1",
  "delivery": {
    "mode": "reliable",
    "ack": true,
    "resume": false
  },
  "meta": {},
  "payload": "base64url-bytes",
  "createdAt": "iso-time"
}
```

`payload` is opaque. The kernel preserves it as bytes.

## Revocation

```text
trust record revoked
active sessions stopped by the application
future handshakes fail
optional signed revocation event is transported by the application
```

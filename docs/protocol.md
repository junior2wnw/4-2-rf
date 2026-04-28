# Protocol

## Pairing

```text
A creates a signed invite.
B verifies A identity and invite signature.
B stores A as trusted after local consent.
A stores B as trusted through its own consent path.
Future sessions reconnect through fresh handshakes.
```

An invite is renderer-agnostic:

```text
trustlink:v1:pair:<base64url stable-json signed payload>
```

## Handshake

```text
offer:
  permanent public identity
  temporary agreement public key
  capabilities
  requested permissions
  granted permissions
  crypto suite
  timestamp
  identity signature

answer:
  permanent public identity
  temporary agreement public key
  offer hash
  selected capability
  requested permissions
  granted permissions
  crypto suite
  timestamp
  identity signature
```

The permanent key proves identity. The temporary agreement key creates fresh
directional session keys and nonce seeds. Permission grants come from local
trust records. Each reconnect creates a new session.

## Permissions

```text
channel.action
channel.action:resource
channel.*:resource
*.*
```

A permission without a resource covers the action broadly. A permission with a
resource covers only that resource unless `*` is used. Empty resources are
invalid.

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

Transport adapters move sealed frames. The frame is authenticated with session
id, device direction, sequence, transcript hash, selected capability, and caller
context.

Serialized frame form:

```text
trustlink:v1:frame:<base64url stable-json sealed frame>
```

## Byte Envelope

```json
{
  "v": 1,
  "envelopeId": "env_...",
  "streamId": "shared-doc",
  "seq": 7,
  "contentType": "application/octet-stream",
  "format": "custom/binary",
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

`payload` is opaque. The kernel preserves it as bytes and enforces configured
size limits.

## Revocation

```text
trust record revoked
active session closed by the holder
future handshakes fail
optional signed revocation event carried by an adapter
```

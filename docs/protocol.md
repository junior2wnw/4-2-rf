# Protocol

## Pairing

```text
Device A finds Device B.
Device A requests a link.
Device B shows a local approval prompt.
Device B stores A public key and permissions.
Device A stores B public key and permissions.
Future sessions can reconnect without repeating pairing.
```

Pairing creates a trust record:

```json
{
  "peer": "public device identity",
  "state": "trusted",
  "permissions": ["messages.send", "files.send"],
  "version": 1,
  "createdAt": "iso-time"
}
```

## Session Handshake

```text
HELLO
→ capabilities
→ temporary X25519 public key
→ signed identity proof
→ pinned trust check
→ permission snapshot
→ session keys
→ READY
```

The permanent Ed25519 key proves identity. Session data uses temporary X25519-derived keys.

The temporary X25519 key creates a fresh shared secret for this session. Reconnect means a new session.

## Envelope

```json
{
  "v": 1,
  "msgId": "msg_...",
  "streamId": "str_...",
  "channel": "files",
  "type": "chunk",
  "contentType": "application/octet-stream",
  "encoding": "base64url",
  "delivery": {
    "mode": "reliable",
    "ack": true,
    "resume": true,
    "idempotencyKey": "transfer:7"
  },
  "meta": {
    "filename": "data.zip",
    "chunkIndex": 7
  },
  "payload": "..."
}
```

## Delivery Modes

- `reliable`: files, JSON, commands.
- `ordered`: shell-like command streams and ordered APIs.
- `unordered`: telemetry.
- `latest_only`: screen, sensor, and video state.
- `durable`: important events that can replay after reconnect.
- `at_most_once`: single send attempt.
- `at_least_once`: retry, receiver handles duplicates.
- `exactly_once`: idempotency key required.

## Revocation

```text
trust record revoked
peer public key blocked
active sessions stopped
future reconnect denied
optional revocation pushed to other trusted devices
```

# Architecture

TrustLink Core is built around one rule:

```text
Connect trusted device identities.
```

## Layers

1. Identity Layer
   Device identity is an Ed25519 public key. The private key stays on the device.

2. Trust Store
   A peer becomes trusted only after explicit local consent. Trust is pairwise and can be asymmetric.

3. Discovery Layer
   Discovery can find candidates through LAN, known endpoints, rendezvous, or relay metadata. Every candidate must prove its identity key.

4. Path Engine
   Candidate paths are ranked by latency, loss, bandwidth, cost, battery policy, locality, relay usage, and local policy.

5. Transport Adapters
   Transports implement one small contract. They move encrypted frames only.

6. Session Security
   Each session uses temporary X25519 keys, signed handshake transcripts, HKDF-SHA256, and ChaCha20-Poly1305 frames.

7. Envelope
   One message envelope carries many future data types: text, files, API calls, events, telemetry, and custom protocols.

8. Permission Engine
   Peers get specific actions: `messages.send`, `files.send`, `api.call:/health`.

9. State Sync
   Reconnect compares stream checkpoints, replayable durable messages, and resumable transfers.

10. Recovery Engine
   After disconnect, the node discovers paths again, races them, rotates session keys, resumes streams, and refreshes permissions.

11. Abuse Protection
   Rendezvous, relay, and pairing surfaces should use rate limits, quotas, and clear denial events.

12. Audit
   Logs events such as pairing, selected path, denied permission, reconnect, and revocation without recording payload.

13. Module Registry
   Storage, discovery, transports, channels, UI adapters, QR renderers, and tools connect through one registry.

## Design Decisions

- Every action is checked through permissions.
- Device identity is pinned to a public key.
- Relay services forward encrypted frames.
- Discovery is scoped to known peers and configured providers.
- The first product surface starts with messages, files, and events.
- Every reconnect creates a fresh session.

## Production Adapters

The core is transport-ready. Real deployments should add adapters like:

- `lan_quic`
- `internet_quic`
- `webrtc_datachannel`
- `https_stream`
- `relay`
- persistent trust storage through SQLite or the platform key/value store
- private key storage through DPAPI, Keychain, Android Keystore, Secret Service, TPM, or a hardware key

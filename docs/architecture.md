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

3. Link Space
   Two or more devices can share one link context. Internally, every device pair keeps the same simple pairwise link model.

4. Discovery Layer
   Discovery can find candidates through any configured provider. Every candidate must prove its identity key.

5. Path Engine
   Candidate paths are ranked by latency, loss, bandwidth, cost, battery policy, locality, forwarding, and local policy.

6. Transport Adapters
   Transports implement one small contract. They move encrypted frames only. Transport ids are open strings.

7. Session Security
   Each session uses temporary X25519 keys, signed handshake transcripts, HKDF-SHA256, and ChaCha20-Poly1305 frames.

8. Envelope
   One message envelope carries any channel data: text, binary, API calls, events, telemetry, and custom protocols.

9. Permission Engine
   Peers get specific actions: `data.send`, `events.sync`, `api.call:/health`.

10. State Sync
   Reconnect compares stream checkpoints, replayable durable messages, and resumable transfers.

11. Recovery Engine
   After disconnect, the node discovers paths again, races them, rotates session keys, resumes streams, and refreshes permissions.

12. Abuse Protection
   Public service surfaces should use rate limits, quotas, and clear denial events.

13. Audit
   Logs events such as pairing, selected path, denied permission, reconnect, and revocation without recording payload.

14. Module Registry
   Storage, discovery, transports, channels, UI adapters, QR renderers, and tools connect through one registry.

## Design Decisions

- Every action is checked through permissions.
- Device identity is pinned to a public key.
- Forwarding services move encrypted frames.
- Discovery is scoped to known peers and configured providers.
- Starter modules provide messages, files, and QR as examples.
- Every reconnect creates a fresh session.
- Transport and channel ids stay open for user modules.

## Adapter Examples

The kernel accepts any adapter id. A technology user can add adapters like:

- `local.fast`
- `edge.standard`
- `forwarder.standard`
- `vendor.custom`
- persistent trust storage through SQLite or the platform key/value store
- private key storage through DPAPI, Keychain, Android Keystore, Secret Service, TPM, or a hardware key

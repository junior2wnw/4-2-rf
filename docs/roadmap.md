# Roadmap

## MVP

- Pairwise trust.
- Local-first discovery contract.
- Signed handshake.
- Session encryption.
- Envelope and delivery modes.
- Permissions per channel/action/resource.
- File chunking with resume metadata.
- Recovery state machine.
- Discovery and transport contracts.
- State sync plan.
- Rate-limit primitive for exposed services.
- Technical audit events without payload.
- Module registry.
- UI contract.
- QR invite renderer.

## Next

- SQLite trust store adapter.
- DPAPI, Keychain, Android Keystore, Secret Service, TPM key storage adapters.
- QUIC transport adapter.
- HTTPS stream transport adapter.
- WebRTC DataChannel adapter.
- Relay frame forwarder for encrypted frames.
- Rendezvous service for temporary endpoint exchange.
- Stream multiplexer with backpressure.
- CLI pairing flow with QR/link payloads.

## Later

- Trust groups with signed membership records.
- Device migration without private key export.
- Policy templates for family, team, server, and support use cases.
- Formal protocol specification.
- Third-party security audit.

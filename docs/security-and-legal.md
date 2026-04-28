# Security And Legal Notes

TrustLink Core is for consent-based links between devices the user owns or is allowed to administer.

## Product Description

Use:

- simple reliable device bridge;
- trusted device link;
- consent-based pairing;
- explicit permissions;
- local-first connection;
- reconnect through unstable networks.

## Security Model

TrustLink uses standard primitives:

- Ed25519 for device identity signatures.
- X25519 for session key agreement.
- HKDF-SHA256 for key derivation.
- ChaCha20-Poly1305 for frame encryption.
- SHA-256 for ids and transcript hashes.

Rules:

- private keys stay on the device;
- discovery candidates must prove their identity key;
- forwarding services move encrypted frames only;
- permissions are checked per action;
- reconnect rotates session keys;
- revocation kills active and future sessions.

## Production Requirements

Before real-world deployment:

- external cryptographic review;
- transport adapter review;
- OS keychain or TPM-backed private key storage;
- fuzzing for frame and envelope parsing;
- SQLite or equivalent atomic trust store;
- abuse-rate limits on public service surfaces;
- privacy review for metadata retention;
- clear user-facing consent and revocation flow.

## Data Logging

Audit logs should include technical events only:

- peer connected;
- peer disconnected;
- permission denied;
- forwarding path used;
- transfer completed;
- policy changed;
- device revoked.

Payload, private keys, session keys, file content, clipboard content, and command output stay outside default audit logs.

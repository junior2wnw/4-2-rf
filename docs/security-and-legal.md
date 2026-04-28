# Security And Legal Notes

TrustLink Core is for lawful, consent-based links between devices the user owns or is allowed to administer.

## Safe Description

Use:

- simple reliable device bridge;
- trusted device link;
- consent-based pairing;
- explicit permissions;
- local-first connection;
- reconnect through unstable networks.

Avoid:

- bypass tool;
- anti-blocking;
- hidden VPN;
- invisible tunnel;
- DPI evasion;
- access to prohibited resources;
- bypassing corporate controls.

## Security Model

TrustLink uses standard primitives:

- Ed25519 for device identity signatures.
- X25519 for session key agreement.
- HKDF-SHA256 for key derivation.
- ChaCha20-Poly1305 for frame encryption.
- SHA-256 for ids and transcript hashes.

Rules:

- private keys do not leave the device;
- discovery never equals trust;
- relay never sees plaintext;
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
- abuse-rate limits on rendezvous and relay;
- privacy review for metadata retention;
- clear user-facing consent and revocation flow.

## Data Logging

Audit logs should include technical events only:

- peer connected;
- peer disconnected;
- permission denied;
- relay used;
- transfer completed;
- policy changed;
- device revoked.

Do not log payload, private keys, session keys, file content, clipboard content, or command output by default.

# Security Notes

TrustLink Kernel is a security boundary, so the boundary stays small.

## Guarantees The Kernel Tries To Provide

- device identity is pinned to a public signing key
- pairing requires an explicit trust record
- handshakes fail for unknown or revoked peers
- each session uses fresh temporary agreement keys
- transports see sealed frames
- byte payloads stay opaque to the kernel

## Metadata Still Visible To Transports

- timing
- frame sizes
- endpoint ids chosen by the application
- session ids
- source and target device ids

Applications that need stronger metadata privacy can add padding, batching,
private rendezvous, or layered forwarding through adapters.

## Invite Risk

A pairing invite is a signed offer. The accepting device decides whether to
store trust.

## Hardening Checklist

Before handling sensitive real data, higher-level systems should add:

- platform-backed private-key storage
- threat-model review
- protocol test vectors
- decoder fuzzing
- replay and reordering tests
- rate limits on public endpoints
- revocation propagation policy

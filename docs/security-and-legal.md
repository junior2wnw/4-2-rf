# Security Notes

TrustLink Kernel is a security boundary, so the boundary stays small.

## Guarantees The Kernel Tries To Provide

- device identity is pinned to a public signing key
- pairing requires an explicit trust record
- handshakes fail for unknown or revoked peers
- each session uses fresh temporary agreement keys
- transports see sealed frames, not application payloads
- byte payloads are not interpreted by the kernel

## Metadata Still Visible To Transports

- timing
- frame sizes
- endpoint ids chosen by the application
- session ids
- source and target device ids

Applications that need stronger metadata privacy should add padding, batching,
private rendezvous, or onion-style forwarding outside the kernel.

## Invite Risk

A pairing invite is a signed offer, not automatic trust. A stolen invite can be
presented before expiration, but the accepting device still decides whether to
store trust.

## Production Requirements

Before handling sensitive real data, a product should add:

- platform-backed private-key storage
- threat-model review
- protocol test vectors
- decoder fuzzing
- replay and reordering tests
- rate limits on public relays
- revocation propagation policy

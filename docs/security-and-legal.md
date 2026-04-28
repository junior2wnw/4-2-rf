# Security Notes

TrustLink Kernel is a security boundary, so the boundary stays small.

## Kernel Security Properties

- device identity is pinned to a public signing key
- pairing creates an explicit local trust record
- handshakes require trusted, active peers
- session grants are derived from local trust records
- every session uses fresh temporary agreement keys
- directional keys and nonce seeds derive from the handshake transcript
- sealed frames reject replay and sequence gaps
- byte payloads stay opaque to the kernel
- size limits protect frame and envelope decoders

## Metadata Visible To Transports

- timing
- frame sizes
- endpoint ids chosen by the adapter
- session ids
- source and target device ids

Applications that need stronger metadata privacy can add padding, batching,
private rendezvous, or layered forwarding through adapters.

## Invite Risk

A pairing invite is a signed offer. The accepting device decides whether to
store trust.

## Hardening Checklist

Before sensitive real data, add:

- platform-backed private-key storage
- threat-model review
- protocol test vectors
- decoder fuzzing
- adapter conformance tests
- public endpoint rate limits
- revocation propagation policy

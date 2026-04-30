# Security Notes

TrustLink Kernel is a security boundary, so the boundary stays small.

## Legal Boundary

This repository is public source, outside OSI-approved open source. The canonical
license is `LICENSE` in the repository root.

The intent is:

- the kernel owns technology, protocol, crypto, recovery, discovery, and
  reliability primitives;
- applications own names, UI, content, business flows, concrete transports,
  hosted services, and app-specific behavior;
- Alik "Lord" Gaynetdinov keeps ownership of the kernel;
- commercial users that reach 10,000,000 RUB in trailing twelve-month gross
  revenue must sign a commercial license before continued live use;
- default commercial economics are 7% attributable gross revenue plus 5% fully
  diluted equity, unless a signed agreement says otherwise.

Avoid describing this repository as MIT, Apache, public domain, royalty-free
for large commercial use, or OSI open source.

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

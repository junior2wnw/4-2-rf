# Link Space

A link space is a small versioned context for two or more devices.

```text
one context
many device identities
ordinary pairwise trust links
versioned membership state
```

For three devices:

```text
A <-> B
A <-> C
B <-> C
```

This keeps the technology simple:

- each device keeps its own identity key
- each pair reconnects independently
- permissions remain specific
- one member can be removed cleanly
- shared state can sync over many pairwise paths

The shared state format belongs above the kernel: text, CRDT updates, binary
chunks, game state, telemetry, or another byte format.

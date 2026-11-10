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
- each pair can reconnect independently
- permissions remain specific
- one member can be removed cleanly
- the application can sync one shared state over many pairwise paths

The kernel does not decide whether the shared state is text, CRDT updates,
binary chunks, game state, or telemetry.

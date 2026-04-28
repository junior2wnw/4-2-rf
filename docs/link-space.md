# Link Space

`LinkSpace` is the simple multi-device form of TrustLink.

The idea:

```text
one context
many devices
same pairwise link
versioned state
```

For two devices, there is one pair.

```text
A <-> B
```

For three devices, there are three ordinary pairs.

```text
A <-> B
A <-> C
B <-> C
```

For four devices, the same rule continues. The technology stays simple because every connection is still the normal two-device link.

## Why This Shape

- each device keeps its own identity key;
- each pair can reconnect independently;
- permissions can stay specific;
- one participant can be paused or removed cleanly;
- state sync can use a versioned snapshot.

## Minimal Example

```ts
import { LinkSpace, createDeviceIdentity, toPublicIdentity } from "trustlink-core";

const a = createDeviceIdentity("A");
const b = createDeviceIdentity("B");
const c = createDeviceIdentity("C");

const space = LinkSpace.create("Home", toPublicIdentity(a), ["data.send"]);

space.addMember(toPublicIdentity(b), ["data.send"]);
space.addMember(toPublicIdentity(c), ["events.sync"]);

console.log(space.snapshot().pairs.length); // 3
```

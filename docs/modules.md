# Modules

TrustLink Core is built as a small kernel with extension points. The kernel stays small; modules carry concrete behavior.

Users can add modules for:

- key storage;
- trust storage;
- discovery providers;
- transport adapters;
- channel adapters;
- UI adapters;
- QR renderers;
- policy tools.

## Module Shape

```ts
import { defineTrustLinkModule } from "trustlink-core";

export const myModule = defineTrustLinkModule({
  manifest: {
    id: "example.module",
    name: "Example Module",
    version: "1.0.0",
    kind: "tool",
    description: "Adds one custom capability.",
    capabilities: ["example"]
  },
  setup(context) {
    context.log("module ready");
  }
});
```

## App Setup

```ts
import { TrustLinkApp, createKernelModule, createStarterModule } from "trustlink-core";

const app = await TrustLinkApp.create({
  label: "Laptop",
  modules: [
    createKernelModule(),
    createStarterModule()
  ]
});

console.log(app.modules.listModules());
```

## UI Adapter

Any UI can mount the same `UiApi`: web, desktop, mobile, terminal, service panel, or another app.

```ts
const uiAdapter = {
  id: "web-ui",
  mount(api) {
    api.subscribe((event) => {
      console.log(event.type);
    });
  }
};
```

The UI talks through commands and events. The core stays independent from React, Vue, Electron, mobile frameworks, and terminal tools.

## QR Module

Pairing invites can be rendered as SVG, terminal output, or data URL.

```ts
const invite = createPairingInvite(identity, {
  requestedPermissions: ["messages.send"],
  offeredPermissions: ["messages.send", "files.send"]
});

const qr = await renderPairingQr(invite, undefined, { format: "svg" });
```

## Link Space

`LinkSpace` keeps one shared context for two or more devices. It stays simple: every participant is connected through the same pairwise model used by two devices.

```ts
const space = LinkSpace.create("My Link", toPublicIdentity(a), ["data.send"]);

space.addMember(toPublicIdentity(b), ["data.send"]);
space.addMember(toPublicIdentity(c), ["events.sync"]);

console.log(space.snapshot().pairs);
```

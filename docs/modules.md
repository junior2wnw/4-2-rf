# Modules

TrustLink Core is built as a small kernel with extension points.

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
import { TrustLinkApp, createCoreModule } from "trustlink-core";

const app = await TrustLinkApp.create({
  label: "Laptop",
  modules: [createCoreModule()]
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

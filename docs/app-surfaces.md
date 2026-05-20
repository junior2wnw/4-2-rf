# App Surfaces

App surfaces are small frontend applications that attach to a trusted link
without owning the trust system.

The kernel rule is simple:

```text
surface renders UI
kernel owns identity, trust, origin checks, capability grants, routing, jobs,
artifacts, and proof
```

An application shell may call them mini apps, tools, panels, widgets, or
extensions. The same contract applies.

## Why This Belongs In The Kernel

Remote apps usually need more than an iframe:

- a selected peer or device;
- a trusted origin or controlled proxy;
- a small capability list;
- a nonce-bound bridge;
- durable jobs and file/artifact transfer;
- audit/proof after mutating work.

Those are technology primitives. Shell UI, buttons, app catalogs, account
gating, and visual layout stay in the application shell.

## Hosting Modes

### Inline

The surface is a tiny generated bundle stored by the shell and opened with a
sandboxed inline frame. This is useful for user-requested helpers that need to
appear in the current chat on every device without a domain or deploy server.

```ts
normalizeAppSurfaceInstallRequest({
  id: "appka",
  title: "Appka",
  inlineHtml: "<!doctype html><button>ok</button>",
  capabilities: ["chat.append"]
}, {
  baseUrl: "https://example.test",
  allowInlineHtml: true
});
```

Result: `mode: "inline"`, `url: "about:srcdoc"`. The shell should sandbox
the frame, bind messages to a nonce, and cap bundle size.

### Same-origin

The surface is bundled with the application shell and served from the same
origin. This is the default for first-party maintained tools.

```ts
resolveAppSurfaceUrl("/apps/console/index.html", {
  baseUrl: "https://example.test"
});
```

Result: `mode: "same-origin"`, no extra frame source.

### Remote origin

The surface is hosted on a trusted HTTPS domain or stable HTTPS endpoint. The
application shell must allow that exact origin in its frame policy.

```ts
resolveAppSurfaceUrl("https://tools.example.test/surface/", {
  baseUrl: "https://example.test"
});
```

Result: `mode: "remote-origin"`, `frameSrc: "https://tools.example.test"`.

### Device-local

The surface runs on a selected device, LAN host, private IP, or loopback helper.
Deployed shells should prefer HTTPS or a controlled tunnel. Plain HTTP is
acceptable only for explicit loopback development or a shell-owned local helper.

```ts
resolveAppSurfaceUrl("http://127.0.0.1:5174/", {
  baseUrl: "https://example.test",
  allowLoopbackHttp: true
});
```

Result: `mode: "device-local"`.

### Kernel proxy

The surface is a non-browser URL. It is a kernel intent such as
`trustlink://surface/device-console`. The shell resolves it into a short-lived
same-origin URL backed by a trusted peer, forwarder, tunnel, or device service.

```ts
resolveAppSurfaceUrl("trustlink://surface/device-console", {
  baseUrl: "https://example.test"
});
```

Result: `mode: "kernel-proxy"`, `requiresKernelProxy: true`.

## Bridge Shape

The bridge should stay small and capability-gated. A surface sends a `ready`
message with a per-open nonce. The shell replies with context and granted
capabilities. Later messages request capabilities instead of touching devices
directly.

Useful capability families:

- `chat.append`
- `agent.invoke`
- `terminal.run`
- `file.pick`
- `file.save`
- `artifact.push`
- `job.start`
- `job.status`
- `job.stop`
- `context.refresh`
- `close`

The kernel module intentionally models names, origin validation, route
classification, frame-source extraction, and permission strings. Concrete
message transport remains an adapter because browsers, native apps, embedded
hosts, and server shells expose different bridge APIs.

## Install And Open Request

An agent or shell can ask for a surface to appear in an account, chat, or
device scope with one small request. The kernel normalizes ids, checks
capability names, classifies the URL, and returns the exact frame origin a
shell must allow.

```ts
normalizeAppSurfaceInstallRequest({
  id: "account-console",
  title: "Account Console",
  url: "/apps/account-console/index.html",
  // Or inlineHtml for a small generated app.
  scope: "account",
  open: true,
  capabilities: ["chat.append", "terminal.run"]
}, {
  baseUrl: "https://example.test"
});
```

Use `allowKernelProxy: true` only after the shell has a same-origin proxy or
tunnel for intent URLs such as `trustlink://surface/...`. Until then, those
requests stay rejected so a generated app cannot iframe a raw device secret or
private service by accident.

## Adapter Checklist

An application shell that supports app surfaces should:

1. Register app definitions in its own manifest or catalog.
2. Normalize ids with `normalizeAppSurfaceId`.
3. Resolve URLs with `resolveAppSurfaceUrl`.
4. Add `appSurfaceFrameSources` to its frame policy.
5. Validate iframe messages with `appSurfaceAllowedOrigin` plus a per-open
   nonce.
6. Convert each requested action into an explicit capability check.
7. Execute device work through trusted link capabilities, without giving the
   surface raw device secrets.
8. Record proof for mutating, long-running, or remote-device actions.

If a shell needs an app-specific scheme such as `soty://`, pass it as a
`kernelIntentSchemes` value and resolve it through that shell's trusted proxy
route before the browser sees an iframe URL.

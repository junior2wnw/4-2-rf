# Agent Runtime

Agent runtime is the installed local capability host for a trusted device. It is
the technology layer below a chat shell, dashboard, or automation panel.

The runtime rule is:

```text
agent hosts capability adapters
kernel describes capability names, risk, durable jobs, proof, and permissions
shells decide UI, copy, account gating, and final user flow
```

## Capability Families

The generic families are intentionally broad:

- `console`
- `filesystem`
- `process`
- `service`
- `package`
- `browser`
- `desktop`
- `screen`
- `keyboard`
- `mouse`
- `clipboard`
- `network`
- `traffic`
- `surface`
- `app`
- `api`
- `job`
- `artifact`
- `audio`
- `os`
- `transaction`
- `device`

Adapters can map these families to PowerShell, AppleScript, xdotool, browser
DevTools, local APIs, app SDKs, broker terminals, CRM clients, IDEs, media
tools, installers, or any other host program.

`traffic.*` covers explicit Link Traffic grants. The kernel owns the generic
capability names (`traffic.exit`, `traffic.proxy`, `traffic.system`), target
shape, mode normalization, risk, confirmation, and proof fields. A concrete
agent may implement this as a bounded fetch proxy, a SOCKS/CONNECT adapter, or a
machine-scope route helper; the shell still owns the visible consent switch and
the adapter still owns packets, sockets, and OS integration.

`surface.*` covers agent-created frontend helpers: build, serve, install, open,
update, and remove. Pair it with the app-surface install request so the runtime
can prepare the bundle while the shell still owns account scope, frame policy,
bridge grants, and proof.

## Transaction Work

Trading, order entry, payments, publishing, destructive admin work, and similar
flows should use a two-step capability shape:

1. `transaction.prepare` or `transaction.preview` builds a visible structured
   intent and proof.
2. `transaction.submit` requires explicit confirmation and returns result proof.

The runtime contract keeps this generic. A shell or adapter may call it a deal,
order, payment, publish action, or approval flow.

## Durable Jobs

Every long action should be a durable job:

- stable `jobId`
- idempotency key for retries
- `running`, `completed`, `failed`, `blocked`, or `waiting-confirmation`
- result path or structured result
- proof fields
- sanitized learning or audit receipt when useful

Small read-only probes can stay direct. Repeated or state-changing actions
should become adapter-backed jobs.

## Adapter Checklist

An installed agent should:

1. Publish a runtime manifest with `buildAgentRuntimeManifest`.
2. Expose one front door for capability invocation.
3. Keep specific programs behind adapters, for example `app.connect`,
   `app.read`, `app.write`, `api.post`, or `transaction.submit`.
4. Attach risk and confirmation policy to each action.
5. Return structured proof after every mutating action.
6. Keep secrets in the platform or user-approved adapter, outside prompts and
   logs.
7. Promote repeated manual recipes into manifest-pinned capabilities with tests.

This lets many shells use the same installed agent without each shell inventing
its own remote-control system.

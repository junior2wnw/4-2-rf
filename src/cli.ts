#!/usr/bin/env node
import { fileChunkEnvelope, missingChunks, planFileTransfer, createFileChunk } from "./adapters/file-transfer.js";
import { textMessage } from "./adapters/messages.js";
import { createPairingInvite, encodePairingInvite, pairingInviteSummary } from "./pairing/invite.js";
import { renderPairingQr } from "./pairing/qr.js";
import { TrustLinkNode } from "./runtime/trustlink-node.js";
import { TrustLinkApp } from "./sdk/app.js";
import { createCoreModule } from "./sdk/core-module.js";

const command = process.argv[2] ?? "demo";

if (command === "demo") {
  runDemo();
} else if (command === "modules") {
  await runModules();
} else if (command === "pair:qr") {
  await runPairQr();
} else if (command === "doctor") {
  await runDoctor();
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Try: trustlink demo | modules | pair:qr | doctor");
  process.exitCode = 1;
}

function runDemo(): void {
  const lordbook = new TrustLinkNode("Lordbook");
  const pocket = new TrustLinkNode("Pocket Node");

  lordbook.pairWith(pocket, {
    approvedBy: "Lordbook:local-user",
    permissionsForPeer: ["messages.send", "files.send", "events.subscribe:link"],
    permissionsFromPeer: ["messages.send", "files.send"]
  });

  const { localSession, peerSession, selectedPath } = lordbook.connectTo(pocket);
  const envelope = textMessage("TrustLink: find, ask, remember, bridge, recover.");
  lordbook.trustStore.requirePermission(pocket.identity.id, {
    channel: envelope.channel,
    action: "send"
  });

  const sealed = localSession.seal(JSON.stringify(envelope), envelope.msgId);
  const opened = peerSession.openUtf8(sealed, envelope.msgId);

  const plan = planFileTransfer("transfer_demo", "manifest.json", 4096, 1024);
  const chunk = createFileChunk(plan, 0, Buffer.from(JSON.stringify({ ok: true }), "utf8"));
  const chunkEnvelope = fileChunkEnvelope(chunk);

  lordbook.disconnectFrom(pocket);
  const recovery = lordbook.recoveryFor(pocket.identity.id).snapshot();

  console.log(JSON.stringify({
    product: "TrustLink Core",
    position: "simple reliable device bridge for trusted devices",
    devices: [
      {
        label: lordbook.identity.label,
        id: lordbook.identity.id,
        fingerprint: lordbook.identity.fingerprint
      },
      {
        label: pocket.identity.label,
        id: pocket.identity.id,
        fingerprint: pocket.identity.fingerprint
      }
    ],
    selectedPath: {
      kind: selectedPath.kind,
      endpoint: selectedPath.endpoint,
      score: selectedPath.score,
      reasons: selectedPath.reasons
    },
    session: localSession.snapshot(),
    deliveredMessage: JSON.parse(opened),
    fileTransfer: {
      plan,
      firstChunkEnvelope: {
        msgId: chunkEnvelope.msgId,
        delivery: chunkEnvelope.delivery,
        meta: chunkEnvelope.meta
      },
      missingAfterFirstChunk: missingChunks(plan.totalChunks, [0])
    },
    recovery,
    audit: lordbook.audit.list()
  }, null, 2));
}

async function runModules(): Promise<void> {
  const app = await TrustLinkApp.create({
    label: "TrustLink Node",
    modules: [createCoreModule()]
  });

  console.log(JSON.stringify({
    modules: app.modules.listModules(),
    adapters: {
      keyStores: app.modules.adapters().keyStores.map((adapter) => adapter.id),
      trustStores: app.modules.adapters().trustStores.map((adapter) => adapter.id),
      discoveryProviders: app.modules.adapters().discoveryProviders.map((adapter) => adapter.name),
      transportAdapters: app.modules.adapters().transportAdapters.map((adapter) => adapter.kind),
      channelAdapters: app.modules.adapters().channelAdapters.map((adapter) => adapter.channel),
      uiAdapters: app.modules.adapters().uiAdapters.map((adapter) => adapter.id),
      qrRenderers: app.modules.adapters().qrRenderers.map((adapter) => adapter.id)
    }
  }, null, 2));
}

async function runPairQr(): Promise<void> {
  const node = new TrustLinkNode(process.argv[3] ?? "TrustLink Node");
  const invite = createPairingInvite(node.identity, {
    requestedPermissions: ["messages.send"],
    offeredPermissions: ["messages.send", "files.send"],
    ttlMs: 10 * 60 * 1000
  });
  const rendered = await renderPairingQr(invite, undefined, { format: "terminal" });

  console.log(rendered.body);
  console.log(JSON.stringify({
    inviteUrl: encodePairingInvite(invite),
    summary: pairingInviteSummary(invite)
  }, null, 2));
}

async function runDoctor(): Promise<void> {
  const app = await TrustLinkApp.create({
    label: "TrustLink Doctor",
    modules: [createCoreModule()]
  });

  console.log(JSON.stringify({
    status: "ready",
    checks: {
      modules: app.modules.listModules().length,
      qr: app.modules.adapters().qrRenderers.length,
      channels: app.modules.adapters().channelAdapters.map((adapter) => adapter.channel),
      storage: app.modules.adapters().keyStores.map((adapter) => adapter.id)
    }
  }, null, 2));
}

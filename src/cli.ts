#!/usr/bin/env node
import { fileChunkEnvelope, missingChunks, planFileTransfer, createFileChunk } from "./adapters/file-transfer.js";
import { textMessage } from "./adapters/messages.js";
import { TrustLinkNode } from "./runtime/trustlink-node.js";

const command = process.argv[2] ?? "demo";

if (command === "demo") {
  runDemo();
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Try: trustlink demo");
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

import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptPairingInvite,
  createCoreModule,
  createDeviceIdentity,
  createHeadlessUiBridge,
  createPairingInvite,
  decodePairingInvite,
  encodePairingInvite,
  FileTransferService,
  renderPairingQr,
  TrustLinkApp,
  TrustStore,
  verifyPairingInvite
} from "../src/index.js";

test("core module registers default adapters", async () => {
  const app = await TrustLinkApp.create({
    label: "A",
    modules: [createCoreModule()]
  });

  const adapters = app.modules.adapters();

  assert.equal(app.modules.listModules()[0]?.id, "trustlink.core");
  assert.deepEqual(adapters.channelAdapters.map((adapter) => adapter.channel), ["messages", "files"]);
  assert.equal(adapters.qrRenderers.length, 1);
  assert.equal(adapters.keyStores.length, 1);
});

test("pairing invite round trip creates a trust record", () => {
  const a = createDeviceIdentity("A");
  const bTrust = TrustStore.empty();
  const invite = createPairingInvite(a, {
    requestedPermissions: ["messages.send"],
    offeredPermissions: ["messages.send", "files.send"]
  });

  const decoded = decodePairingInvite(encodePairingInvite(invite));
  const record = acceptPairingInvite(bTrust, decoded, {
    approvedBy: "B:user"
  });

  assert.equal(verifyPairingInvite(decoded), true);
  assert.equal(record.peer.id, a.id);
  assert.deepEqual(record.permissions, ["files.send", "messages.send"]);
});

test("qr renderer creates svg content for pairing invite", async () => {
  const identity = createDeviceIdentity("A");
  const invite = createPairingInvite(identity, {
    requestedPermissions: ["messages.send"],
    offeredPermissions: ["messages.send"]
  });

  const qr = await renderPairingQr(invite, undefined, { format: "svg" });

  assert.equal(qr.contentType, "image/svg+xml");
  assert.match(qr.body, /<svg/);
});

test("headless ui bridge publishes state and events", () => {
  const bridge = createHeadlessUiBridge({
    device: { id: "a", label: "A", fingerprint: "AAAA" },
    peers: [],
    connections: []
  });
  const events: string[] = [];

  bridge.subscribe((event) => events.push(event.type));
  bridge.emit({ type: "notice", level: "success", message: "ready" });
  bridge.setState({
    device: { id: "a", label: "A", fingerprint: "AAAA" },
    peers: [],
    connections: [{ peerId: "b", state: "CONNECTED" }]
  });

  assert.deepEqual(events, ["notice", "state.changed"]);
});

test("file transfer service prepares resumable chunks", () => {
  const service = new FileTransferService();
  const prepared = service.prepareBuffer("hello.txt", Buffer.from("hello world"), 5);

  assert.equal(prepared.plan.totalChunks, 3);
  assert.equal(prepared.chunks[0]?.delivery.resume, true);
  assert.deepEqual(service.missing(prepared.plan, [0, 2]), [1]);
});

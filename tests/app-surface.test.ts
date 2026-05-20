import test from "node:test";
import assert from "node:assert/strict";
import {
  appSurfaceAllowedOrigin,
  appSurfaceFrameSources,
  appSurfaceInstallSchema,
  appSurfacePermission,
  assertAppSurfaceCapabilities,
  normalizeAppSurfaceId,
  normalizeAppSurfaceInstallRequest,
  resolveAppSurfaceUrl
} from "../src/index.js";

const baseUrl = "https://soty.example";

test("app surface urls classify same origin and remote origins", () => {
  assert.equal(normalizeAppSurfaceId("  Remote Console  "), "remote-console");

  const same = resolveAppSurfaceUrl("/mini-apps/console/index.html", { baseUrl });
  assert.equal(same.mode, "same-origin");
  assert.equal(same.frameSrc, undefined);
  assert.equal(same.requiresKernelProxy, false);

  const remote = resolveAppSurfaceUrl("https://tools.example/app/", { baseUrl });
  assert.equal(remote.mode, "remote-origin");
  assert.equal(remote.origin, "https://tools.example");
  assert.equal(remote.frameSrc, "https://tools.example");
  assert.equal(appSurfaceAllowedOrigin("https://tools.example", remote.url, baseUrl), true);
  assert.equal(appSurfaceAllowedOrigin("https://evil.example", remote.url, baseUrl), false);
});

test("app surface urls handle device-local and kernel proxy routes", () => {
  const loopback = resolveAppSurfaceUrl("http://127.0.0.1:5174/", {
    baseUrl,
    allowLoopbackHttp: true
  });
  assert.equal(loopback.mode, "device-local");

  const privateHttps = resolveAppSurfaceUrl("https://192.168.1.10:4443/ui/", { baseUrl });
  assert.equal(privateHttps.mode, "device-local");

  const kernelProxy = resolveAppSurfaceUrl("trustlink://surface/device-console", { baseUrl });
  assert.equal(kernelProxy.mode, "kernel-proxy");
  assert.equal(kernelProxy.requiresKernelProxy, true);
  assert.equal(appSurfaceAllowedOrigin("https://soty.example", kernelProxy.url, baseUrl), false);

  const shellSpecificProxy = resolveAppSurfaceUrl("soty://mini-app/device-console", {
    baseUrl,
    kernelIntentSchemes: ["trustlink:", "soty:"]
  });
  assert.equal(shellSpecificProxy.mode, "kernel-proxy");
});

test("app surface urls reject unsafe origins unless explicitly allowed", () => {
  assert.throws(
    () => resolveAppSurfaceUrl("http://192.168.1.10:5174/", { baseUrl }),
    /rejected/
  );
  assert.throws(
    () => resolveAppSurfaceUrl("http://127.0.0.1:5174/", { baseUrl }),
    /allowLoopbackHttp/
  );

  const allowed = resolveAppSurfaceUrl("http://192.168.1.10:5174/", {
    baseUrl,
    allowedOrigins: ["http://192.168.1.10:5174"]
  });
  assert.equal(allowed.mode, "device-local");
});

test("app surface helpers extract frame sources and permission names", () => {
  assert.deepEqual(appSurfaceFrameSources([
    { url: "/mini-apps/a/index.html" },
    { url: "https://tools.example/a/" },
    { url: "https://tools.example/b/" },
    { url: "https://other.example/c/" }
  ], { baseUrl }), ["https://other.example", "https://tools.example"]);

  assert.doesNotThrow(() => assertAppSurfaceCapabilities(["chat.append", "terminal.run"]));
  assert.throws(() => assertAppSurfaceCapabilities(["bad name"]), /Invalid/);
  assert.equal(appSurfacePermission("Remote Console", "terminal.run"), "app.call:remote-console/terminal.run");
});

test("app surface install requests produce scoped open plans", () => {
  const plan = normalizeAppSurfaceInstallRequest({
    id: " Account Tool ",
    title: "Account Tool",
    summary: "Fast account helper",
    url: "/mini-apps/account-tool/index.html",
    capabilities: ["chat.append", "terminal.run", "chat.append"],
    scope: "account",
    open: true,
    revision: "rev-1"
  }, {
    baseUrl,
    now: "2026-05-20T00:00:00.000Z"
  });

  assert.equal(plan.schema, appSurfaceInstallSchema);
  assert.equal(plan.definition.id, "account-tool");
  assert.equal(plan.definition.url, "https://soty.example/mini-apps/account-tool/index.html");
  assert.deepEqual(plan.definition.capabilities, ["chat.append", "terminal.run"]);
  assert.equal(plan.scope, "account");
  assert.equal(plan.open, true);
  assert.equal(plan.mode, "same-origin");
  assert.equal(plan.installedAt, "2026-05-20T00:00:00.000Z");
});

test("app surface install requests keep unsafe connector modes explicit", () => {
  const remote = normalizeAppSurfaceInstallRequest({
    app: {
      id: "remote-tool",
      title: "Remote Tool",
      url: "https://tools.example/ui/",
      capabilities: ["context.refresh"]
    },
    scope: "chat",
    targetDeviceId: "device-1"
  }, { baseUrl });

  assert.equal(remote.scope, "chat");
  assert.equal(remote.targetDeviceId, "device-1");
  assert.equal(remote.frameSrc, "https://tools.example");

  assert.throws(
    () => normalizeAppSurfaceInstallRequest({
      id: "proxy-tool",
      title: "Proxy Tool",
      url: "trustlink://surface/proxy-tool",
      capabilities: ["context.refresh"]
    }, { baseUrl }),
    /kernel proxy/
  );
});

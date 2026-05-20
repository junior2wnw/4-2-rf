import test from "node:test";
import assert from "node:assert/strict";
import {
  appSurfaceAllowedOrigin,
  appSurfaceFrameSources,
  appSurfacePermission,
  assertAppSurfaceCapabilities,
  normalizeAppSurfaceId,
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

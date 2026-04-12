import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryService } from "../src/services/memory-service.js";

describe("MemoryService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges private and shared results and authenticates against the sidecar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: "deploy postgres",
          results: [
            {
              text: "private result",
              wing: "session-1",
              room: "chat",
              sourceFile: "private://1",
              similarity: 0.61,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: "deploy postgres",
          results: [
            {
              text: "shared result",
              wing: "public-playbooks",
              room: "playbooks",
              sourceFile: "promotion://1",
              similarity: 0.93,
            },
          ],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const service = new MemoryService("http://memory.internal", "memory-key-1234567890");
    const result = await service.searchForScope({
      query: "deploy postgres",
      scope: "session-1",
      limit: 5,
    });

    expect(result?.results.map((item) => item.text)).toEqual(["shared result", "private result"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.headers).toMatchObject({
        accept: "application/json",
        "content-type": "application/json",
        "x-memory-sidecar-key": "memory-key-1234567890",
      });
    }
  });

  it("stores shared playbooks through the authenticated sidecar write path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "drawer_123", stored: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new MemoryService("http://memory.internal", "memory-key-1234567890");
    const result = await service.storeDrawer({
      text: "Reusable recovery playbook",
      wing: "public-playbooks",
      room: "playbooks",
      sourceFile: "promotion://abc",
    });

    expect(result).toEqual({ id: "drawer_123", stored: true });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/v1/drawers", "http://memory.internal"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-memory-sidecar-key": "memory-key-1234567890",
        }),
      }),
    );
  });

  it("returns null when both lookup scopes are unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new MemoryService("http://memory.internal", "memory-key-1234567890");
    const result = await service.searchForScope({
      query: "deploy postgres",
      scope: "session-1",
      limit: 5,
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

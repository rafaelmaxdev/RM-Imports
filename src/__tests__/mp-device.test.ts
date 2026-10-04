import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureMPDeviceScript, getMPDeviceSessionId } from "../lib/mpDevice";

function setupBrowser() {
  const windowStub: { MP_DEVICE_SESSION_ID?: string } = {};
  const scripts = new Map<string, unknown>();
  const documentStub = {
    getElementById: vi.fn((id: string) => scripts.get(id) ?? null),
    createElement: vi.fn(() => ({
      id: "",
      src: "",
      async: false,
      setAttribute: vi.fn(),
    })),
    head: {
      appendChild: vi.fn((script: { id: string }) => {
        scripts.set(script.id, script);
      }),
    },
  };

  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("document", documentStub);
  return { windowStub, documentStub };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("getMPDeviceSessionId", () => {
  it("returns undefined outside the browser without blocking", async () => {
    await expect(getMPDeviceSessionId()).resolves.toBeUndefined();
  });

  it("returns an already available ID without creating the script", async () => {
    const { windowStub, documentStub } = setupBrowser();
    windowStub.MP_DEVICE_SESSION_ID = "device-ready";

    await expect(getMPDeviceSessionId()).resolves.toBe("device-ready");
    expect(documentStub.createElement).not.toHaveBeenCalled();
  });

  it("resolves when the script exposes the ID after 100ms", async () => {
    vi.useFakeTimers();
    const { windowStub, documentStub } = setupBrowser();
    const pending = getMPDeviceSessionId();

    await vi.advanceTimersByTimeAsync(100);
    windowStub.MP_DEVICE_SESSION_ID = "device-late";
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toBe("device-late");
    expect(documentStub.head.appendChild).toHaveBeenCalledTimes(1);
  });

  it("resolves undefined after 1500ms when the script is blocked", async () => {
    vi.useFakeTimers();
    setupBrowser();
    const pending = getMPDeviceSessionId();

    await vi.advanceTimersByTimeAsync(1500);

    await expect(pending).resolves.toBeUndefined();
  });

  it("creates only one script when ensure is called repeatedly", () => {
    const { documentStub } = setupBrowser();

    ensureMPDeviceScript();
    ensureMPDeviceScript();

    expect(documentStub.createElement).toHaveBeenCalledTimes(1);
    expect(documentStub.head.appendChild).toHaveBeenCalledTimes(1);
  });
});

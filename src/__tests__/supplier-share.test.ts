import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareSupplierImage, shareSupplierItem } from "../lib/supplierShare";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubNavigator(value: Partial<Navigator>): void {
  vi.stubGlobal("navigator", value as Navigator);
}

describe("prepareSupplierImage", () => {
  it("rejects an empty URL", async () => {
    await expect(prepareSupplierImage(" ")).rejects.toThrow(Error);
  });

  it("rejects a bad response", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(prepareSupplierImage("https://example.com/camisa.png")).rejects.toThrow(Error);
  });

  it("rejects HTML even when the URL looks like an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("<html>não é uma imagem</html>", {
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await expect(prepareSupplierImage("https://example.com/camisa.png")).rejects.toThrow(Error);
  });

  it("rejects an empty image file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new Uint8Array(), { headers: { "content-type": "image/png" } }),
      ),
    );

    await expect(prepareSupplierImage("https://example.com/camisa.png")).rejects.toThrow(Error);
  });

  it("keeps the PNG MIME type and extension", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
      ),
    );

    const file = await prepareSupplierImage("https://example.com/camisa.png");

    expect(file.name).toBe("camisa.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(3);
  });
});

describe("shareSupplierItem", () => {
  const file = new File([new Uint8Array([1])], "camisa.png", { type: "image/png" });

  it("shares the supported file and text together", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, canShare: vi.fn().mockReturnValue(true) });

    await expect(shareSupplierItem("texto", file)).resolves.toBe("image-text");
    expect(share).toHaveBeenCalledWith({ files: [file], text: "texto" });
  });

  it("returns cancelled without copying after an aborted file share", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelado", "AbortError"));
    const writeText = vi.fn();
    stubNavigator({ share, canShare: vi.fn().mockReturnValue(true), clipboard: { writeText } as unknown as Clipboard });

    await expect(shareSupplierItem("texto", file)).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("rejects a failed file share without downgrading to text", async () => {
    const share = vi.fn().mockRejectedValue(new Error("falha do navegador"));
    stubNavigator({ share, canShare: vi.fn().mockReturnValue(true) });

    await expect(shareSupplierItem("texto", file)).rejects.toThrow(Error);
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ files: [file], text: "texto" });
  });

  it("uses text sharing when the file is unsupported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, canShare: vi.fn().mockReturnValue(false) });

    await expect(shareSupplierItem("texto", file)).resolves.toBe("text");
    expect(share).toHaveBeenCalledWith({ text: "texto" });
  });

  it("uses the clipboard when sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } as unknown as Clipboard });

    await expect(shareSupplierItem("texto", file)).resolves.toBe("clipboard");
    expect(writeText).toHaveBeenCalledWith("texto");
  });
});

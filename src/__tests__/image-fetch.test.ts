import { afterEach, describe, expect, it, vi } from "vitest";

const imageFetchModule = "../../server/lib/image-fetch";
const { fetchImage } = await import(imageFetchModule);

const allowedDomains = ["images.example.com"];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchImage", () => {
  it("fetches an allowed HTTPS image", async () => {
    const fetchMock = stubFetch(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const result = await fetchImage("https://images.example.com/image.png", allowedDomains);

    expect(result.contentType).toBe("image/png");
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect to a disallowed domain without a second fetch", async () => {
    const fetchMock = stubFetch(
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example.com/image.png" },
      }),
    );

    await expect(fetchImage("https://images.example.com/image.png", allowedDomains)).rejects.toThrow(
      "Image URL is not allowed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects non-image content types", async () => {
    stubFetch(
      new Response("not an image", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(fetchImage("https://images.example.com/image.png", allowedDomains)).rejects.toThrow(
      "Upstream response is not an image",
    );
  });

  it("rejects images larger than 10 MiB", async () => {
    stubFetch(
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(10 * 1024 * 1024 + 1),
        },
      }),
    );

    await expect(fetchImage("https://images.example.com/image.png", allowedDomains)).rejects.toThrow(
      "Image is too large",
    );
  });
});

import { beforeEach, describe, it, expect, vi } from "vitest";
import { DEFAULT_CONFIG } from "../types";
import { getCached, isCacheStale, setCache } from "../lib/cache";
import { supabase } from "../lib/supabase";
import { formatPedidoDateTime, getLojaConfig, parseImageUrls } from "../lib/db";

vi.mock("../lib/cache", () => ({
  getCached: vi.fn(),
  isCacheStale: vi.fn(),
  setCache: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function mockConfigFetch(data: { key: string; value: unknown }[]) {
  vi.mocked(supabase.from).mockReturnValue({
    select: vi.fn().mockResolvedValue({ data, error: null }),
  } as never);
}

describe("formatPedidoDateTime", () => {
  it("formats created_at in the Recife timezone", () => {
    expect(formatPedidoDateTime({
      created_at: "2026-10-03T00:57:42.50889+00:00",
      data: "03/10/2026",
      hora: "00:57",
    })).toEqual({ data: "02/10/2026", hora: "21:57" });
  });

  it("falls back to the original fields when created_at is invalid or absent", () => {
    const fallback = { data: "03/10/2026", hora: "00:57" };
    expect(formatPedidoDateTime({ ...fallback, created_at: "invalid" })).toEqual(fallback);
    expect(formatPedidoDateTime(fallback)).toEqual(fallback);
  });
});

describe("parseImageUrls", () => {
  // ── Array input ──

  it("returns the same array when given an array of strings", () => {
    const input = ["https://example.com/img1.jpg", "https://example.com/img2.jpg"];
    expect(parseImageUrls(input)).toEqual(input);
  });

  it("filters out falsy entries from arrays", () => {
    const input = ["https://example.com/img1.jpg", "", "https://example.com/img2.jpg", null as unknown as string, undefined as unknown as string];
    expect(parseImageUrls(input)).toEqual(["https://example.com/img1.jpg", "https://example.com/img2.jpg"]);
  });

  it("returns an empty array when given an empty array", () => {
    expect(parseImageUrls([])).toEqual([]);
  });

  it("returns an empty array when array contains only empty strings", () => {
    expect(parseImageUrls(["", ""])).toEqual([]);
  });

  // ── String input ──

  it("wraps a single string into an array", () => {
    expect(parseImageUrls("https://example.com/img.jpg")).toEqual(["https://example.com/img.jpg"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseImageUrls("")).toEqual([]);
  });

  // ── null / undefined ──

  it("returns an empty array for null", () => {
    expect(parseImageUrls(null)).toEqual([]);
  });

  it("returns an empty array for undefined", () => {
    expect(parseImageUrls(undefined)).toEqual([]);
  });
});

describe("getLojaConfig", () => {
  it("fetches and caches config when the cache is stale", async () => {
    const cachedConfig = { ...DEFAULT_CONFIG, desconto_global: 10 };
    vi.mocked(getCached).mockReturnValue(cachedConfig);
    vi.mocked(isCacheStale).mockReturnValue(true);
    mockConfigFetch([{ key: "desconto_global", value: 20 }]);

    const config = await getLojaConfig();

    expect(config.desconto_global).toBe(20);
    expect(setCache).toHaveBeenCalledWith("loja_config", config);
    expect(supabase.from).toHaveBeenCalledWith("loja_config_publico");
  });

  it("returns fresh cached config without fetching", async () => {
    const cachedConfig = { ...DEFAULT_CONFIG, desconto_global: 10 };
    vi.mocked(getCached).mockReturnValue(cachedConfig);
    vi.mocked(isCacheStale).mockReturnValue(false);

    await expect(getLojaConfig()).resolves.toBe(cachedConfig);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(setCache).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import { parseImageUrls } from "../lib/db";

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

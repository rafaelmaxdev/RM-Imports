import { describe, expect, it } from "vitest";
import { resolveOrderPath } from "../../api/order/[[...path]]";
import { bearerToken, createOrderAccessToken, verifyOrderAccessToken } from "../../server/lib/security";

describe("order access security", () => {
  const secret = "service-role-secret-for-tests";
  const orderId = "UL-ABCDEFGH";

  it("accepts only the token signed for the requested order", () => {
    const token = createOrderAccessToken(orderId, secret);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyOrderAccessToken(orderId, token, secret)).toBe(true);
    expect(verifyOrderAccessToken("UL-ABCDEFG2", token, secret)).toBe(false);
    const replacement = token.endsWith("0") ? "1" : "0";
    expect(verifyOrderAccessToken(orderId, `${token.slice(0, -1)}${replacement}`, secret)).toBe(false);
  });

  it("parses bearer headers strictly", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
  });

  it("resolves order route candidates", () => {
    expect(resolveOrderPath(["api", "order", "UL-KZX9AL76"])).toBe("UL-KZX9AL76");
    expect(resolveOrderPath("UL-KZX9AL76")).toBe("UL-KZX9AL76");
    expect(resolveOrderPath(["api", "order", "search"])).toBe("search");
    expect(resolveOrderPath(undefined, "/api/order/UL-KZX9AL76")).toBe("UL-KZX9AL76");
    expect(resolveOrderPath([undefined, [["UL-KZX9AL76"]]])).toBe("UL-KZX9AL76");
  });
});

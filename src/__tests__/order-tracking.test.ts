import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOrderAccessToken,
  getPersistentOrderAccessToken,
  removeOrderAccessToken,
  saveOrderAccessToken,
} from "../lib/orderAccess";
import {
  buildOrderTrackingLink,
  clearLastTrackedOrder,
  getLastTrackedOrderId,
  parseOrderTrackingId,
  rememberLastTrackedOrder,
} from "../lib/orderTracking";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const orderId = "UL-KZX9AL76";
const otherOrderId = "UL-ABCDEFGH";
const token = "a".repeat(64);

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("order tracking links", () => {
  it("contains only a valid order ID", () => {
    const link = buildOrderTrackingLink("https://shop.example", orderId);
    const url = new URL(link);

    expect(url.origin).toBe("https://shop.example");
    expect(url.pathname).toBe("/meu-pedido");
    expect([...url.searchParams.entries()]).toEqual([["pedido", orderId]]);
    expect(parseOrderTrackingId(url.search)).toBe(orderId);
    expect(parseOrderTrackingId("?pedido=UL-invalid")).toBeNull();
    expect(link).not.toMatch(/telefone|token|nome|cpf|email/i);
  });

  it("rejects invalid IDs and non-http origins", () => {
    expect(() => buildOrderTrackingLink("https://shop.example", "UL-INVALID0")).toThrow();
    expect(() => buildOrderTrackingLink("javascript:alert(1)", orderId)).toThrow();
  });
});

describe("order access storage", () => {
  it("keeps persistent and session access isolated and forgets only one order", () => {
    saveOrderAccessToken(orderId, token);
    saveOrderAccessToken(otherOrderId, "b".repeat(64), false);

    expect(getPersistentOrderAccessToken(orderId)).toBe(token);
    expect(getOrderAccessToken(otherOrderId)).toBe("b".repeat(64));

    removeOrderAccessToken(otherOrderId);

    expect(getOrderAccessToken(otherOrderId)).toBeNull();
    expect(getOrderAccessToken(orderId)).toBe(token);
  });

  it("prefers a valid session token and keeps each storage map to 20 entries", () => {
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    const ids = Array.from({ length: 21 }, (_, index) => {
      let value = index;
      let suffix = "";
      do {
        suffix = alphabet[value % alphabet.length] + suffix;
        value = Math.floor(value / alphabet.length);
      } while (value > 0);
      return `UL-${suffix.padStart(8, "2")}`;
    });
    ids.forEach((id, index) => saveOrderAccessToken(id, String(index).padStart(64, "a")));
    const localEntries = JSON.parse(localStorage.getItem("rm_order_access") || "{}");
    expect(Object.keys(localEntries)).toHaveLength(20);

    localStorage.removeItem("rm_order_access");
    ids.forEach((id, index) => saveOrderAccessToken(id, String(index).padStart(64, "b"), false));
    const sessionEntries = JSON.parse(sessionStorage.getItem("rm_order_access") || "{}");
    expect(Object.keys(sessionEntries)).toHaveLength(20);

    localStorage.setItem("rm_order_access", JSON.stringify({ [orderId]: token }));
    sessionStorage.setItem("rm_order_access", JSON.stringify({ [orderId]: "c".repeat(64) }));
    expect(getOrderAccessToken(orderId)).toBe("c".repeat(64));
  });

  it("does not accept invalid IDs or tokens and tolerates blocked storage", () => {
    saveOrderAccessToken(orderId, "not-a-token");
    saveOrderAccessToken("UL-invalid", token);
    expect(getOrderAccessToken(orderId)).toBeNull();

    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    vi.stubGlobal("localStorage", blocked);
    vi.stubGlobal("sessionStorage", blocked);

    expect(() => saveOrderAccessToken(orderId, token)).not.toThrow();
    expect(() => removeOrderAccessToken(orderId)).not.toThrow();
    expect(getOrderAccessToken(orderId)).toBeNull();
  });

  it("falls back to session storage when persistent storage is blocked", () => {
    const session = memoryStorage();
    const blockedLocal = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    vi.stubGlobal("localStorage", blockedLocal);
    vi.stubGlobal("sessionStorage", session);

    saveOrderAccessToken(orderId, token);

    expect(getPersistentOrderAccessToken(orderId)).toBeNull();
    expect(getOrderAccessToken(orderId)).toBe(token);
    expect(JSON.parse(session.getItem("rm_order_access") || "{}"))
      .toEqual({ [orderId]: token });
  });

  it("removes only the selected order from both storage areas", () => {
    const otherToken = "b".repeat(64);
    const sessionToken = "c".repeat(64);
    localStorage.setItem("rm_order_access", JSON.stringify({
      [orderId]: token,
      [otherOrderId]: otherToken,
    }));
    sessionStorage.setItem("rm_order_access", JSON.stringify({
      [orderId]: sessionToken,
      [otherOrderId]: otherToken,
    }));

    removeOrderAccessToken(otherOrderId);

    expect(getPersistentOrderAccessToken(otherOrderId)).toBeNull();
    expect(getOrderAccessToken(otherOrderId)).toBeNull();
    expect(getPersistentOrderAccessToken(orderId)).toBe(token);
    expect(getOrderAccessToken(orderId)).toBe(sessionToken);
  });
});

describe("last tracked order", () => {
  it("stores only the ID and reads it back safely", () => {
    rememberLastTrackedOrder(orderId);

    expect(getLastTrackedOrderId()).toBe(orderId);
    expect(localStorage.getItem("rm_last_tracked_order")).toBe(JSON.stringify({ orderId }));

    clearLastTrackedOrder();
    expect(getLastTrackedOrderId()).toBeNull();
  });

  it("ignores corrupt last-order data and tolerates blocked storage", () => {
    localStorage.setItem("rm_last_tracked_order", JSON.stringify({ orderId: "UL-invalid", phone: "5511999999999" }));
    expect(getLastTrackedOrderId()).toBeNull();

    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    vi.stubGlobal("localStorage", blocked);
    expect(() => rememberLastTrackedOrder(orderId)).not.toThrow();
    expect(() => clearLastTrackedOrder()).not.toThrow();
    expect(getLastTrackedOrderId()).toBeNull();
  });

  it("never persists an invalid last-order ID", () => {
    rememberLastTrackedOrder("UL-invalid");

    expect(localStorage.getItem("rm_last_tracked_order")).toBeNull();
    localStorage.setItem("rm_last_tracked_order", JSON.stringify({ orderId: "UL-invalid" }));
    expect(getLastTrackedOrderId()).toBeNull();
  });
});

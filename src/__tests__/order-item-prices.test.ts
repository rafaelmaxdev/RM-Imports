import { describe, expect, it } from "vitest";
import { getOrderItemPrices } from "../lib/orderItemPrices";

const item = (preco: number, precoBase?: number) => ({ preco, precoBase });

describe("getOrderItemPrices", () => {
  it("applies the order discount to a legacy single item", () => {
    expect(getOrderItemPrices({ itens: [item(139.90)], total: 125.91 })).toEqual([
      { original: 139.90, final: 125.91 },
    ]);
  });

  it("allocates rounded cents proportionally and closes at the total", () => {
    const prices = getOrderItemPrices({
      itens: [item(10.01), item(20.02), item(30.03)],
      total: 59.99,
    });

    expect(prices).toEqual([
      { original: 10.01, final: 10 },
      { original: 20.02, final: 20 },
      { original: 30.03, final: 29.99 },
    ]);
    expect(Math.round(prices.reduce((sum, price) => sum + price.final, 0) * 100)).toBe(5999);
  });

  it("uses the first item for an equal largest remainder", () => {
    expect(getOrderItemPrices({ itens: [item(10), item(10), item(10)], total: 29.99 })).toEqual([
      { original: 10, final: 9.99 },
      { original: 10, final: 10 },
      { original: 10, final: 10 },
    ]);
  });

  it("keeps a greater historical item base without using current prices", () => {
    expect(getOrderItemPrices({ itens: [item(119.92, 149.90)], total: 119.92 })).toEqual([
      { original: 149.90, final: 119.92 },
    ]);
  });

  it("does not allocate when the total includes extras", () => {
    expect(getOrderItemPrices({ itens: [item(50), item(25)], total: 80 })).toEqual([
      { original: 50, final: 50 },
      { original: 25, final: 25 },
    ]);
  });

  it("handles a zero total", () => {
    expect(getOrderItemPrices({ itens: [item(50, 60), item(25)], total: 0 })).toEqual([
      { original: 60, final: 0 },
      { original: 25, final: 0 },
    ]);
  });

  it("handles an order without items", () => {
    expect(getOrderItemPrices({ itens: [], total: 0 })).toEqual([]);
  });

  it("falls back to finite non-negative values for invalid money", () => {
    expect(getOrderItemPrices({
      itens: [item(Number.NaN, Number.POSITIVE_INFINITY), item(-4, 12), item(10, -1)],
      total: Number.NaN,
    })).toEqual([
      { original: 0, final: 0 },
      { original: 12, final: 0 },
      { original: 10, final: 10 },
    ]);
  });

  it("does not invent a discount from an invalid total", () => {
    expect(getOrderItemPrices({ itens: [item(100)], total: Number.POSITIVE_INFINITY, cupom_desconto: 50 })).toEqual([
      { original: 100, final: 100 },
    ]);
  });

  it("does not mutate the order items", () => {
    const itens = [item(10, 12), item(20)];
    const before = itens.map((value) => ({ ...value }));

    getOrderItemPrices({ itens, total: 25 });

    expect(itens).toEqual(before);
  });
});

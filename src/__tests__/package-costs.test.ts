import { describe, expect, it } from "vitest";
import { calculatePackageCosts, getPackageHistoryCosts } from "../lib/packageCosts";

describe("package costs", () => {
  it("converts shirt costs and adds the saved import tax without treating zero freight as a charge", () => {
    const result = calculatePackageCosts([17, 10.5, 12, 13, 10.5, 8.5, 8.5, 12], 5.2, 0, 50.12);
    expect(result).toMatchObject({ totalUsd: 92, subtotal: 478.4, final: 528.52 });
    expect(result.items.every((item) => item.shipping === 0)).toBe(true);
    expect(result.items.reduce((sum, item) => sum + Math.round((item.final ?? 0) * 100), 0)).toBe(52852);
  });

  it("updates the subtotal when a shirt price changes and preserves all fee cents", () => {
    const result = calculatePackageCosts([0, 12.51, 14.23, 14.23], 5.19, 10.01, 0.01);
    expect(result).toMatchObject({ totalUsd: 40.97, subtotal: 212.63, final: 222.65 });
    expect(result.items[0]).toEqual({ shipping: 0, tax: 0, final: 0 });
    expect(result.items.reduce((sum, item) => sum + Math.round((item.final ?? 0) * 100), 0)).toBe(22265);
  });

  it("keeps the USD total available without inventing an exchange rate", () => {
    expect(calculatePackageCosts([17, 0], null, 0, 50.12)).toMatchObject({
      totalUsd: 17, subtotal: null, final: null,
    });
  });

  it("uses individual saved costs in package history and excludes admin shares from sales costs", () => {
    const costs = [15, 12, 13, 13, 12, 9, 9, 13];
    const lines = costs.map((_, index) => ({
      orderId: `order-${index}`,
      index: 0,
      admin: index < 3,
      estimatedUsd: 10,
    }));
    const saved = Object.fromEntries(costs.map((cost, index) => [`order-${index}-0`, cost]));
    const result = getPackageHistoryCosts(lines, saved, 5.08, 487.68, 0, 50.12);

    expect(result).toMatchObject({
      estimated: false,
      totalUsd: 96,
      subtotal: 487.68,
      customer: { product: 28448, shipping: 0, importation: 2924 },
    });
    expect(result.shares.map(({ product }) => product)).toEqual([7620, 6096, 6604, 6604, 6096, 4572, 4572, 6604]);
    expect(result.shares.reduce((sum, share) => sum + share.importation, 0)).toBe(5012);
  });
});

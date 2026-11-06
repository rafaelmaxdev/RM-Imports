import { describe, expect, it } from "vitest";
import { calculatePackageCosts } from "../lib/packageCosts";

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
});

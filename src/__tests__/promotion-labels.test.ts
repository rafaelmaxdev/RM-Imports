import { describe, expect, it } from "vitest";
import { promotionLabels } from "../lib/promotionLabels";

describe("promotionLabels", () => {
  it("hides the team for legacy promotions by default", () => {
    expect(promotionLabels("Time A", "Campanha")).toEqual({ title: "Campanha", subtitle: null });
  });

  it("shows the team when replacement is disabled", () => {
    expect(promotionLabels("Time A", "Campanha", false)).toEqual({ title: "Campanha", subtitle: "Time A" });
  });

  it("uses the team when there is no campaign name", () => {
    expect(promotionLabels("Time A", null, true)).toEqual({ title: "Time A", subtitle: null });
  });

  it("trims campaign names and treats whitespace as absent", () => {
    expect(promotionLabels("Time A", "  Campanha  ")).toEqual({ title: "Campanha", subtitle: null });
    expect(promotionLabels("Time A", "   ", false)).toEqual({ title: "Time A", subtitle: null });
  });
});

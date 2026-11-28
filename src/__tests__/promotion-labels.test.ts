import { describe, expect, it } from "vitest";
import { blackFridayPrintLabel, promotionLabels } from "../lib/promotionLabels";

describe("blackFridayPrintLabel", () => {
  it("shows a benefit only for items with a waived print or available personalization", () => {
    expect(blackFridayPrintLabel({
      id: "5927aa08-1f30-5093-8189-597b4c9d1db6", nome: "Rogério Ceni", tipo: "Manga Longa Retrô",
    })).toBe("Estampa grátis");
    expect(blackFridayPrintLabel({ id: "camisa", nome: "Camisa", tipo: "Torcedor" })).toBe("Personalização grátis");
    expect(blackFridayPrintLabel({ id: "polo", nome: "Camisa Polo", tipo: "Polo" })).toBeNull();
    expect(blackFridayPrintLabel({ id: "nba", nome: "Regata Lakers — Doncic #77", tipo: "NBA" })).toBeNull();
  });
});

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

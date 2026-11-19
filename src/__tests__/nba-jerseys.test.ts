import { describe, expect, it } from "vitest";
import { nbaPlayer, nbaPlayerOptions } from "../../server/lib/nba-jerseys";
import { validateProductVariant } from "../../server/lib/checkout";
import { montarNome } from "../ProdutoForm";
import { tamanhosDisponiveis } from "../types";

const base = { id: "curry", tipo: "NBA", liga: "NBA", time: "Golden State Warriors", temporada: "2025/26", feminino: false,
  nome: "Regata Golden State Warriors 2025/26 Icon Azul — Curry #30" };

describe("NBA player jerseys", () => {
  it("generates NBA edition and player names without football labels and keeps free names", () => {
    expect(montarNome("LA Lakers", "NBA", "2026/2027", "", "", "regata", "Icon", "Dončić", "77"))
      .toBe("Regata LA Lakers 2026/2027 Icon — Dončić #77");
    expect(montarNome("Miami Heat", "NBA", "2026/2027", "Regata Heat × GTA VI", "", "regata", "Especial"))
      .toBe("Regata Heat × GTA VI");
    expect(montarNome("Miami Heat", "NBA", "2026/2027", "Heat × GTA VI", "", "regata", "Especial", "Antetokounmpo", "7"))
      .toBe("Heat × GTA VI — Antetokounmpo #7");
  });

  it("offers only the supplier's S to XXL sizes on frontend and backend", () => {
    expect(tamanhosDisponiveis("NBA", false)).toEqual(["P", "M", "G", "GG", "G1"]);
    expect(() => validateProductVariant(base, { tamanho: "G2", genero: "Masculino", personalizado: false })).toThrow();
  });
  it("only groups players of the exact same team, season, edition and color", () => {
    const sibling = { ...base, id: "green", nome: base.nome.replace("Curry #30", "Green #23") };
    const otherColor = { ...base, id: "white", nome: base.nome.replace("Icon Azul", "Association Branca") };
    const otherSeason = { ...base, id: "old", temporada: "2024/25" };
    expect(nbaPlayerOptions(base, [base, sibling, otherColor, otherSeason]).map((p) => p.id)).toEqual(["curry", "green"]);
    expect(nbaPlayer(sibling)?.label).toBe("Green #23");
  });

  it("rejects extra customization of a fixed player jersey at checkout", () => {
    const options = { tamanho: "M", genero: "Masculino", personalizado: false };
    expect(() => validateProductVariant(base, options)).not.toThrow();
    expect(() => validateProductVariant(base, { ...options, personalizado: true })).toThrow();
    expect(() => validateProductVariant({ ...base, nome: "Regata NBA personalizável" }, { ...options, personalizado: true })).not.toThrow();
    expect(nbaPlayer({ ...base, tipo: "Torcedor" })).toBeNull();
  });
});

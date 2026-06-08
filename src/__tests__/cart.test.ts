import { describe, it, expect } from "vitest";
import { calcularPreco, formatarMoeda, DEFAULT_CONFIG, ADICIONAL_TAMANHO, precoPersonalizacao } from "../types";
import type { LojaConfig } from "../types";

/**
 * Cart pricing tests.
 *
 * The cart's `total` is a simple sum of each item's `preco` field.
 * The **real logic** lives in `calcularPreco()` which determines that `preco`.
 * These tests cover the combination of:
 *   - Base price by product type (categoria)
 *   - Size surcharges (G2, G3)
 *   - Personalization fee
 *   - All promo types (porcentagem, novo_preco, leve_pague, leve_3_pague_2, category)
 *   - Custom prices
 *
 * Together they validate every dimension of cart pricing.
 */

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function categoriaEmPromocao(tipo: string, ativa = true): LojaConfig {
  return {
    ...DEFAULT_CONFIG,
    promocao_ativa: { ...DEFAULT_CONFIG.promocao_ativa, [tipo]: ativa },
  };
}

// ---------------------------------------------------------------------------
// Scenario: single item, no frills
// ---------------------------------------------------------------------------
describe("Cart pricing: base scenarios", () => {
  it("composes a Torcedor M without any extras", () => {
    const price = calcularPreco("Torcedor", "M", false);
    expect(price).toBe(129.90);
    expect(formatarMoeda(price)).toBe("R$ 129,90");
  });

  it("composes a Jogador G without extras", () => {
    const price = calcularPreco("Jogador", "G", false);
    expect(price).toBe(169.90);
  });

  it("composes a Retro M without extras", () => {
    const price = calcularPreco("Retrô", "M", false);
    expect(price).toBe(169.90);
  });

  it("composes NBA GG without extras", () => {
    const price = calcularPreco("NBA", "GG", false);
    expect(price).toBe(189.90);
  });
});

// ---------------------------------------------------------------------------
// Scenario: size surcharges
// ---------------------------------------------------------------------------
describe("Cart pricing: size surcharges", () => {
  it.each(["P", "M", "G", "GG", "G1"])("%s has no surcharge", (size) => {
    const price = calcularPreco("Torcedor", size, false);
    expect(price).toBe(129.90);
  });

  it("G2 adds R$10 surcharge", () => {
    const price = calcularPreco("Torcedor", "G2", false);
    expect(price).toBe(129.90 + ADICIONAL_TAMANHO["G2"]);
  });

  it("G3 adds R$20 surcharge", () => {
    const price = calcularPreco("Torcedor", "G3", false);
    expect(price).toBe(129.90 + ADICIONAL_TAMANHO["G3"]);
  });
});

// ---------------------------------------------------------------------------
// Scenario: personalization
// ---------------------------------------------------------------------------
describe("Cart pricing: personalization", () => {
  it("adds personalization fee to base price", () => {
    const price = calcularPreco("Jogador", "M", true);
    expect(price).toBe(169.90 + precoPersonalizacao("Jogador"));
  });

  it("adds personalization fee on top of size surcharge", () => {
    const price = calcularPreco("Jogador", "G3", true);
    expect(price).toBe(169.90 + ADICIONAL_TAMANHO["G3"] + precoPersonalizacao("Jogador"));
  });

  it("uses R$20 personalization for Torcedor only", () => {
    expect(precoPersonalizacao("Torcedor")).toBe(20.00);
    expect(calcularPreco("Torcedor", "M", true)).toBe(129.90 + 20.00);
  });

  it("uses R$25 personalization for Manga Longa Torcedor", () => {
    expect(precoPersonalizacao("Manga Longa Torcedor")).toBe(25.00);
  });

  it("uses R$25 personalization for other types", () => {
    expect(precoPersonalizacao("Jogador")).toBe(25.00);
    expect(precoPersonalizacao("Retrô")).toBe(25.00);
    expect(precoPersonalizacao("Polo")).toBe(25.00);
    expect(precoPersonalizacao("NBA")).toBe(25.00);
  });
});

// ---------------------------------------------------------------------------
// Scenario: individual product promos (porcentagem, novo_preco, leve_pague)
// ---------------------------------------------------------------------------
describe("Cart pricing: individual promos", () => {
  it("porcentagem: 15% off Jogador M no personalization", () => {
    const expectedPromo = Math.round((169.90 - 169.90 * 0.15) * 100) / 100;
    expect(calcularPreco("Jogador", "M", false, undefined, null, "porcentagem", 15))
      .toBe(expectedPromo);
  });

  it("porcentagem: 20% off + G2 surcharge + personalization", () => {
    const expectedPromo = Math.round((169.90 - 169.90 * 0.20) * 100) / 100;
    expect(calcularPreco("Jogador", "G2", true, undefined, null, "porcentagem", 20))
      .toBe(expectedPromo + ADICIONAL_TAMANHO["G2"] + precoPersonalizacao("Jogador"));
  });

  it("novo_preco: custom price overrides base (no surcharges)", () => {
    expect(calcularPreco("NBA", "M", false, undefined, 159.90, "novo_preco"))
      .toBe(159.90);
  });

  it("novo_preco: custom price + G3 surcharge + personalization", () => {
    expect(calcularPreco("NBA", "G3", true, undefined, 159.90, "novo_preco"))
      .toBe(159.90 + ADICIONAL_TAMANHO["G3"] + precoPersonalizacao("NBA"));
  });

  it("leve_pague: uses base price (no discount applied to individual item)", () => {
    expect(calcularPreco("Torcedor", "M", false, undefined, null, "leve_pague"))
      .toBe(129.90);
  });

  it("leve_pague: base + G2 surcharge", () => {
    expect(calcularPreco("Torcedor", "G2", false, undefined, null, "leve_pague"))
      .toBe(129.90 + ADICIONAL_TAMANHO["G2"]);
  });

  it("leve_3_pague_2: uses base price", () => {
    expect(calcularPreco("Torcedor", "M", false, undefined, null, "leve_3_pague_2"))
      .toBe(129.90);
  });
});

// ---------------------------------------------------------------------------
// Scenario: category-level promo
// ---------------------------------------------------------------------------
describe("Cart pricing: category-level promos", () => {
  it("uses promo price when category promo is active", () => {
    const cfg = categoriaEmPromocao("Torcedor", true);
    expect(calcularPreco("Torcedor", "M", false, cfg))
      .toBe(109.90); // DEFAULT_CONFIG.precos_promocao["Torcedor"]
  });

  it("uses base when category promo is inactive", () => {
    const cfg = categoriaEmPromocao("Torcedor", false);
    expect(calcularPreco("Torcedor", "M", false, cfg))
      .toBe(129.90);
  });

  it("category promo + size surcharge", () => {
    const cfg = categoriaEmPromocao("Jogador", true);
    expect(calcularPreco("Jogador", "G3", false, cfg))
      .toBe(139.90 + ADICIONAL_TAMANHO["G3"]);
  });

  it("category promo + personalization", () => {
    const cfg = categoriaEmPromocao("Jogador", true);
    expect(calcularPreco("Jogador", "M", true, cfg))
.toBe(139.90 + precoPersonalizacao("Jogador"));
  });

  it("individual porcentagem overrides category promo", () => {
    const cfg = categoriaEmPromocao("Jogador", true);
    const expectedPromo = Math.round((169.90 - 169.90 * 0.10) * 100) / 100;
    expect(calcularPreco("Jogador", "M", false, cfg, null, "porcentagem", 10))
      .toBe(expectedPromo);
  });
});

// ---------------------------------------------------------------------------
// Scenario: multiple item totals (simulating cart.reduce)
// ---------------------------------------------------------------------------
describe("Cart pricing: multi-item totals", () => {
  /**
   * Simulates what CartContext does to compute `total`:
   *   total = cart.reduce((sum, item) => sum + item.preco, 0)
   */
  function cartTotal(items: { tipo: string; tamanho: string; personalizado: boolean; config?: LojaConfig; precoCustom?: number | null; promoTipo?: any; promoValor?: number | null }[]): number {
    return items.reduce((sum, item) => {
      return sum + calcularPreco(item.tipo, item.tamanho, item.personalizado, item.config, item.precoCustom, item.promoTipo, item.promoValor);
    }, 0);
  }

  it("sums two plain items", () => {
    const total = cartTotal([
      { tipo: "Torcedor", tamanho: "M", personalizado: false },
      { tipo: "Jogador", tamanho: "G", personalizado: false },
    ]);
    expect(total).toBe(129.90 + 169.90);
  });

  it("sums items with size surcharges and personalization", () => {
    const total = cartTotal([
      { tipo: "Torcedor", tamanho: "G2", personalizado: false },
      { tipo: "Jogador", tamanho: "M", personalizado: true },
    ]);
    expect(total).toBe((129.90 + ADICIONAL_TAMANHO["G2"]) + (169.90 + precoPersonalizacao("Jogador")));
  });

  it("sums items with mixed promos", () => {
    const cfgJogadorPromo = categoriaEmPromocao("Jogador", true);
    const total = cartTotal([
      { tipo: "Jogador", tamanho: "M", personalizado: false, config: cfgJogadorPromo },
      { tipo: "Torcedor", tamanho: "G3", personalizado: true, promoTipo: "porcentagem", promoValor: 10 },
    ]);
    const expectedTorcedorPromo = Math.round((129.90 - 129.90 * 0.10) * 100) / 100;
    const expectedItem1 = 139.90; // Jogador em promoção de categoria
    const expectedItem2 = expectedTorcedorPromo + ADICIONAL_TAMANHO["G3"] + precoPersonalizacao("Torcedor");
    expect(total).toBe(expectedItem1 + expectedItem2);
  });

  it("sums items with novo_preco custom prices", () => {
    const total = cartTotal([
      { tipo: "NBA", tamanho: "M", personalizado: false, precoCustom: 159.90, promoTipo: "novo_preco" },
      { tipo: "Retrô", tamanho: "L", personalizado: false },
    ]);
    expect(total).toBe(159.90 + 169.90);
  });

  it("sums items with leve_3_pague_2 (uses base price)", () => {
    const total = cartTotal([
      { tipo: "Torcedor", tamanho: "M", personalizado: false, promoTipo: "leve_3_pague_2" },
      { tipo: "Torcedor", tamanho: "M", personalizado: false, promoTipo: "leve_3_pague_2" },
      { tipo: "Torcedor", tamanho: "M", personalizado: false, promoTipo: "leve_3_pague_2" },
    ]);
    expect(total).toBe(129.90 * 3);
  });

  it("five items with various sizes, personalization, and promos", () => {
    const cfgTorcedorPromo = categoriaEmPromocao("Torcedor", true);
    const total = cartTotal([
      { tipo: "Torcedor", tamanho: "P", personalizado: false, config: cfgTorcedorPromo },
      { tipo: "Jogador", tamanho: "M", personalizado: true },
      { tipo: "Jogador", tamanho: "G2", personalizado: false, promoTipo: "porcentagem", promoValor: 15 },
      { tipo: "NBA", tamanho: "G3", personalizado: true, precoCustom: 179.90, promoTipo: "novo_preco" },
      { tipo: "Retrô", tamanho: "GG", personalizado: false },
    ]);
    const item0 = 109.90; // Torcedor category promo
    const item1 = 169.90 + precoPersonalizacao("Jogador");
    const item2Promo = Math.round((169.90 - 169.90 * 0.15) * 100) / 100;
    const item2 = item2Promo + ADICIONAL_TAMANHO["G2"];
    const item3 = 179.90 + ADICIONAL_TAMANHO["G3"] + precoPersonalizacao("NBA");
    const item4 = 169.90;
    expect(total).toBe(item0 + item1 + item2 + item3 + item4);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("Cart pricing: edge cases", () => {
  it("handles unknown product type with fallback price", () => {
    expect(calcularPreco("TipoInexistente", "M", false)).toBe(89.90);
  });

  it("handles unknown size (no surcharge)", () => {
    // A size not in ADICIONAL_TAMANHO should not add surcharge
    expect(calcularPreco("Torcedor", "XS", false)).toBe(129.90);
  });

  it("handles personalization only (no size surcharge)", () => {
    expect(calcularPreco("Polo", "M", true)).toBe(139.90 + precoPersonalizacao("Polo"));
  });
});

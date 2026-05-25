import { describe, it, expect } from "vitest";
import { calcularPreco, formatarMoeda, DEFAULT_CONFIG, ADICIONAL_TAMANHO, PRECO_PERSONALIZACAO } from "../types";
import type { LojaConfig } from "../types";

/**
 * Cart pricing tests.
 *
 * The cart's `total` is a simple sum of each item's `preco` field.
 * The **real logic** lives in `calcularPreco()` which determines that `preco`.
 * These tests cover the combination of:
 *   - Base price by product type (categoria)
 *   - Size surcharges (3XL, 4XL)
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

  it("composes a Jogador L without extras", () => {
    const price = calcularPreco("Jogador", "L", false);
    expect(price).toBe(169.90);
  });

  it("composes a Retro M without extras", () => {
    const price = calcularPreco("Retrô", "M", false);
    expect(price).toBe(169.90);
  });

  it("composes NBA XL without extras", () => {
    const price = calcularPreco("NBA", "XL", false);
    expect(price).toBe(189.90);
  });
});

// ---------------------------------------------------------------------------
// Scenario: size surcharges
// ---------------------------------------------------------------------------
describe("Cart pricing: size surcharges", () => {
  it.each(["S", "M", "L", "XL", "2XL"])("%s has no surcharge", (size) => {
    const price = calcularPreco("Torcedor", size, false);
    expect(price).toBe(129.90);
  });

  it("3XL adds R$10 surcharge", () => {
    const price = calcularPreco("Torcedor", "3XL", false);
    expect(price).toBe(129.90 + ADICIONAL_TAMANHO["3XL"]);
  });

  it("4XL adds R$20 surcharge", () => {
    const price = calcularPreco("Torcedor", "4XL", false);
    expect(price).toBe(129.90 + ADICIONAL_TAMANHO["4XL"]);
  });
});

// ---------------------------------------------------------------------------
// Scenario: personalization
// ---------------------------------------------------------------------------
describe("Cart pricing: personalization", () => {
  it("adds personalization fee to base price", () => {
    const price = calcularPreco("Jogador", "M", true);
    expect(price).toBe(169.90 + PRECO_PERSONALIZACAO);
  });

  it("adds personalization fee on top of size surcharge", () => {
    const price = calcularPreco("Jogador", "4XL", true);
    expect(price).toBe(169.90 + ADICIONAL_TAMANHO["4XL"] + PRECO_PERSONALIZACAO);
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

  it("porcentagem: 20% off + 3XL surcharge + personalization", () => {
    const expectedPromo = Math.round((169.90 - 169.90 * 0.20) * 100) / 100;
    expect(calcularPreco("Jogador", "3XL", true, undefined, null, "porcentagem", 20))
      .toBe(expectedPromo + ADICIONAL_TAMANHO["3XL"] + PRECO_PERSONALIZACAO);
  });

  it("novo_preco: custom price overrides base (no surcharges)", () => {
    expect(calcularPreco("NBA", "M", false, undefined, 159.90, "novo_preco"))
      .toBe(159.90);
  });

  it("novo_preco: custom price + 4XL surcharge + personalization", () => {
    expect(calcularPreco("NBA", "4XL", true, undefined, 159.90, "novo_preco"))
      .toBe(159.90 + ADICIONAL_TAMANHO["4XL"] + PRECO_PERSONALIZACAO);
  });

  it("leve_pague: uses base price (no discount applied to individual item)", () => {
    expect(calcularPreco("Torcedor", "M", false, undefined, null, "leve_pague"))
      .toBe(129.90);
  });

  it("leve_pague: base + 3XL surcharge", () => {
    expect(calcularPreco("Torcedor", "3XL", false, undefined, null, "leve_pague"))
      .toBe(129.90 + ADICIONAL_TAMANHO["3XL"]);
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
    expect(calcularPreco("Jogador", "4XL", false, cfg))
      .toBe(139.90 + ADICIONAL_TAMANHO["4XL"]);
  });

  it("category promo + personalization", () => {
    const cfg = categoriaEmPromocao("Jogador", true);
    expect(calcularPreco("Jogador", "M", true, cfg))
      .toBe(139.90 + PRECO_PERSONALIZACAO);
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
      { tipo: "Jogador", tamanho: "L", personalizado: false },
    ]);
    expect(total).toBe(129.90 + 169.90);
  });

  it("sums items with size surcharges and personalization", () => {
    const total = cartTotal([
      { tipo: "Torcedor", tamanho: "3XL", personalizado: false },
      { tipo: "Jogador", tamanho: "M", personalizado: true },
    ]);
    expect(total).toBe((129.90 + ADICIONAL_TAMANHO["3XL"]) + (169.90 + PRECO_PERSONALIZACAO));
  });

  it("sums items with mixed promos", () => {
    const cfgJogadorPromo = categoriaEmPromocao("Jogador", true);
    const total = cartTotal([
      { tipo: "Jogador", tamanho: "M", personalizado: false, config: cfgJogadorPromo },
      { tipo: "Torcedor", tamanho: "4XL", personalizado: true, promoTipo: "porcentagem", promoValor: 10 },
    ]);
    const expectedTorcedorPromo = Math.round((129.90 - 129.90 * 0.10) * 100) / 100;
    const expectedItem1 = 139.90; // Jogador em promoção de categoria
    const expectedItem2 = expectedTorcedorPromo + ADICIONAL_TAMANHO["4XL"] + PRECO_PERSONALIZACAO;
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
      { tipo: "Torcedor", tamanho: "S", personalizado: false, config: cfgTorcedorPromo },
      { tipo: "Jogador", tamanho: "M", personalizado: true },
      { tipo: "Jogador", tamanho: "3XL", personalizado: false, promoTipo: "porcentagem", promoValor: 15 },
      { tipo: "NBA", tamanho: "4XL", personalizado: true, precoCustom: 179.90, promoTipo: "novo_preco" },
      { tipo: "Retrô", tamanho: "XL", personalizado: false },
    ]);
    const item0 = 109.90; // Torcedor category promo
    const item1 = 169.90 + PRECO_PERSONALIZACAO;
    const item2Promo = Math.round((169.90 - 169.90 * 0.15) * 100) / 100;
    const item2 = item2Promo + ADICIONAL_TAMANHO["3XL"];
    const item3 = 179.90 + ADICIONAL_TAMANHO["4XL"] + PRECO_PERSONALIZACAO;
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
    expect(calcularPreco("Polo", "M", true)).toBe(139.90 + PRECO_PERSONALIZACAO);
  });
});

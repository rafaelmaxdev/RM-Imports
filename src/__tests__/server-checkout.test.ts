import { describe, expect, it } from "vitest";
import {
  calculateServerItemPrice,
  limitarDescontoCupom,
  validateProductVariant,
  normalizeBrazilPhone,
  type ServerCheckoutConfig,
} from "../../server/lib/checkout";

const config: ServerCheckoutConfig = {
  precos_base: { Torcedor: 129.90, Jogador: 169.90, NBA: 189.90 },
  precos_promocao: { Torcedor: 109.90 },
  promocao_ativa: {},
  desconto_global: null,
  promocoes_time: {},
  pronta_entrega_markup: 20,
  ano_temporada_lancamento: 2026,
  desconto_temporada_anterior: { Torcedor: 6.671, Jogador: 5.266 },
};

describe("normalizeBrazilPhone", () => {
  it("normalizes a formatted national phone", () => {
    expect(normalizeBrazilPhone("(81) 99999-9999")).toBe("5581999999999");
  });

  it("keeps an already international phone normalized", () => {
    expect(normalizeBrazilPhone("+55 (11) 3333-4444")).toBe("551133334444");
  });

  it.each(["", "abc", "(00) 99999-9999", "(81) 9999-999", "5510999999999"])("rejects invalid phone %j", (phone) => {
    expect(() => normalizeBrazilPhone(phone)).toThrow();
  });
});

describe("limitarDescontoCupom", () => {
  it("mantém cupom de 10% sem promoção", () => {
    expect(limitarDescontoCupom(10, 100, 100)).toBe(10);
  });

  it("limita promoção de 15% mais cupom de 10% a 20%", () => {
    expect(limitarDescontoCupom(10, 85, 100)).toBe(5);
  });

  it("não permite cupom quando a promoção já atingiu 20%", () => {
    expect(limitarDescontoCupom(10, 80, 100)).toBe(0);
  });

  it("arredonda a sobra em centavos", () => {
    expect(limitarDescontoCupom(10, 84.99, 99.99)).toBe(5);
  });
});

describe("calculateServerItemPrice", () => {
  it("matches client seasonal launch and previous-season prices", () => {
    const seasonalConfig = {
      ...config,
      precos_base: { ...config.precos_base, Torcedor: 149.90, Jogador: 189.90 },
    };

    expect(calculateServerItemPrice(
      { tipo: "Torcedor", temporada: "2026/2027" },
      { tamanho: "M", personalizado: false },
      seasonalConfig,
    ).preco).toBe(149.90);
    expect(calculateServerItemPrice(
      { tipo: "Torcedor", temporada: "2025/2026" },
      { tamanho: "M", personalizado: false },
      seasonalConfig,
    ).preco).toBeCloseTo(139.90, 2);
    expect(calculateServerItemPrice(
      { tipo: "Jogador", temporada: "2025/2026" },
      { tamanho: "M", personalizado: false },
      seasonalConfig,
    ).preco).toBeCloseTo(179.90, 2);
  });

  it("excludes Retrô and invalid seasonal percentages", () => {
    const seasonalConfig = {
      ...config,
      precos_base: { ...config.precos_base, "Manga Longa Retrô": 169.90, Torcedor: 149.90 },
      desconto_temporada_anterior: { Retrô: 50, "Manga Longa Retrô": 50, Torcedor: 100 },
    };

    expect(calculateServerItemPrice(
      { tipo: "Manga Longa Retrô", temporada: "2025/2026" },
      { tamanho: "M", personalizado: false },
      seasonalConfig,
    ).preco).toBe(169.90);
    expect(calculateServerItemPrice(
      { tipo: "Torcedor", temporada: "2025/2026" },
      { tamanho: "M", personalizado: false },
      seasonalConfig,
    ).preco).toBe(149.90);
  });

  it("returns the base and the server add-ons", () => {
    expect(calculateServerItemPrice(
      { tipo: "Torcedor" },
      { tamanho: "M", personalizado: false },
      config,
    )).toEqual({ preco: 129.90, precoBase: 129.90 });
  });

  it("applies percentage promotion, G2 and personalization", () => {
    expect(calculateServerItemPrice(
      { tipo: "Jogador", promocao_tipo: "porcentagem", promocao_valor: 10 },
      { tamanho: "G2", personalizado: true },
      config,
    )).toEqual({ preco: 187.91, precoBase: 204.90 });
  });

  it("ignores percentage promotions above 100", () => {
    expect(calculateServerItemPrice(
      { tipo: "Torcedor", promocao_tipo: "porcentagem", promocao_valor: 101 },
      { tamanho: "M", personalizado: false },
      config,
    )).toEqual({ preco: 129.90, precoBase: 129.90 });
  });

  it("uses a custom price before team, category and global promotions", () => {
    expect(calculateServerItemPrice(
      { tipo: "NBA", preco_customizado: 159.90 },
      { tamanho: "M", personalizado: false },
      { ...config, desconto_global: 20 },
    )).toEqual({ preco: 159.90, precoBase: 189.90 });
  });

  it("ignores a negative custom price", () => {
    expect(calculateServerItemPrice(
      { tipo: "NBA", preco_customizado: -10 },
      { tamanho: "M", personalizado: false },
      config,
    )).toEqual({ preco: 189.90, precoBase: 189.90 });
  });

  it("applies a team promotion", () => {
    expect(calculateServerItemPrice(
      { tipo: "Torcedor", time: "Time A" },
      { tamanho: "M", personalizado: false },
      { ...config, promocoes_time: { "Time A": { tipo: "porcentagem", valor: 10 } } },
    )).toEqual({ preco: 116.91, precoBase: 129.90 });
  });

  it("adds the pronta-entrega markup", () => {
    expect(calculateServerItemPrice(
      { tipo: "Torcedor" },
      { tamanho: "G3", personalizado: false, prontaEntrega: true },
      config,
    )).toEqual({ preco: 169.90, precoBase: 169.90 });
  });

  it("ignores a negative pronta-entrega markup", () => {
    expect(calculateServerItemPrice(
      { tipo: "Torcedor" },
      { tamanho: "M", personalizado: false, prontaEntrega: true },
      { ...config, pronta_entrega_markup: -20 },
    )).toEqual({ preco: 129.90, precoBase: 129.90 });
  });
});

describe("validateProductVariant", () => {
  it("rejects feminine variants when the product has no feminine version", () => {
    expect(() => validateProductVariant(
      { tipo: "Torcedor", feminino: false },
      { tamanho: "M", genero: "Feminino", personalizado: false },
    )).toThrow();
  });

  it("rejects G1 for feminine variants", () => {
    expect(() => validateProductVariant(
      { tipo: "Torcedor", feminino: true },
      { tamanho: "G1", genero: "Feminino", personalizado: false },
    )).toThrow();
  });

  it("rejects personalization for Polo", () => {
    expect(() => validateProductVariant(
      { tipo: "Polo", feminino: false },
      { tamanho: "M", genero: "Masculino", personalizado: true },
    )).toThrow();
  });

  it("rejects G2 for Manga Longa Torcedor", () => {
    expect(() => validateProductVariant(
      { tipo: "Manga Longa Torcedor", feminino: false },
      { tamanho: "G2", genero: "Masculino", personalizado: false },
    )).toThrow();
  });

  it.each([
    [{ tipo: "Torcedor", feminino: false }, { tamanho: "G3", genero: "Masculino", personalizado: true }],
    [{ tipo: "Manga Longa Jogador", feminino: false }, { tamanho: "G2", genero: "Masculino", personalizado: false }],
    [{ tipo: "Torcedor", feminino: true }, { tamanho: "GG", genero: "Feminino", personalizado: false }],
    [{ tipo: "produto novo", feminino: false }, { tamanho: "G3", genero: "Masculino", personalizado: false }],
  ])("accepts valid variant %#", (product, options) => {
    expect(() => validateProductVariant(product, options)).not.toThrow();
  });
});

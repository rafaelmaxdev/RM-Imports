import { describe, expect, it } from "vitest";
import { calculateServerItemPrice, type ServerCheckoutConfig } from "../../server/lib/checkout";
import { isPromotionActive, promotionEndFromDate } from "../../server/lib/promotions";
import { DEFAULT_CONFIG, getPrecoProduto, type LojaConfig } from "../types";

const endOfOctober = promotionEndFromDate("2026-10-31")!;
const expiredEndsAt = "2000-11-02T03:00:00.000Z";
const activeEndsAt = "2099-11-02T03:00:00.000Z";

function config(overrides: Partial<LojaConfig> = {}): LojaConfig {
  return {
    ...DEFAULT_CONFIG,
    precos_base: { ...DEFAULT_CONFIG.precos_base, Torcedor: 100 },
    precos_promocao: { ...DEFAULT_CONFIG.precos_promocao, Torcedor: 80 },
    promocao_ativa: { ...DEFAULT_CONFIG.promocao_ativa, Torcedor: false },
    ...overrides,
  };
}

describe("promotion validity", () => {
  it("ends at the exclusive Recife midnight", () => {
    expect(endOfOctober).toBe("2026-11-01T03:00:00.000Z");
    expect(isPromotionActive(endOfOctober, Date.parse("2026-11-01T02:59:59.999Z"))).toBe(true);
    expect(isPromotionActive(endOfOctober, Date.parse("2026-11-01T03:00:00.000Z"))).toBe(false);
  });

  it.each(["2026-02-29", "2026-04-31", "31/10/2026"])("rejects invalid date %s", (date) => {
    expect(() => promotionEndFromDate(date)).toThrow(RangeError);
  });

  it("keeps legacy promotions active and fails closed for invalid ends", () => {
    expect(promotionEndFromDate("")).toBeNull();
    expect(isPromotionActive()).toBe(true);
    expect(isPromotionActive(null)).toBe(true);
    expect(isPromotionActive("")).toBe(true);
    expect(isPromotionActive("invalid-date")).toBe(false);
  });
});

describe("expiring team and global promotions", () => {
  it("applies active team promotions and exposes their end", () => {
    const teamEndsAt = activeEndsAt;
    const result = getPrecoProduto(
      "Torcedor",
      config({
        promocoes_time: { "Time A": { tipo: "porcentagem", valor: 10, preco: null, ends_at: teamEndsAt } },
        desconto_global: 20,
        desconto_global_ends_at: "2026-12-01T03:00:00.000Z",
      }),
      null,
      undefined,
      null,
      "Time A",
    );

    expect(result.promo).toBe(90);
    expect(result.endsAt).toBe(teamEndsAt);
  });

  it("falls through expired team and global promotions without skipping category pricing", () => {
    const expired = expiredEndsAt;
    const result = getPrecoProduto(
      "Torcedor",
      config({
        promocao_ativa: { ...DEFAULT_CONFIG.promocao_ativa, Torcedor: true },
        promocoes_time: { "Time A": { tipo: "porcentagem", valor: 10, preco: null, ends_at: expired } },
        desconto_global: 20,
        desconto_global_ends_at: expired,
      }),
      null,
      undefined,
      null,
      "Time A",
    );

    expect(result.promo).toBe(80);
    expect(result.endsAt).toBeUndefined();
  });

  it("uses an active global promotion after an expired team promotion", () => {
    const globalEndsAt = activeEndsAt;
    const result = getPrecoProduto(
      "Torcedor",
      config({
        promocoes_time: { "Time A": { tipo: "novo_preco", valor: null, preco: 70, ends_at: expiredEndsAt } },
        desconto_global: 20,
        desconto_global_ends_at: globalEndsAt,
      }),
      null,
      undefined,
      null,
      "Time A",
    );

    expect(result.promo).toBe(80);
    expect(result.endsAt).toBe(globalEndsAt);
  });

  it("matches expiration and precedence on the server", () => {
    const serverConfig: ServerCheckoutConfig = config({
      promocoes_time: { "Time A": { tipo: "porcentagem", valor: 10, preco: null, ends_at: expiredEndsAt } },
      desconto_global: 20,
      desconto_global_ends_at: activeEndsAt,
    });

    expect(calculateServerItemPrice(
      { tipo: "Torcedor", time: "Time A" },
      { tamanho: "M", personalizado: false },
      serverConfig,
    )).toEqual({ preco: 80, precoBase: 100 });

    expect(calculateServerItemPrice(
      { tipo: "Torcedor", time: "Time A" },
      { tamanho: "M", personalizado: false },
      { ...serverConfig, desconto_global_ends_at: expiredEndsAt },
    )).toEqual({ preco: 100, precoBase: 100 });

    expect(calculateServerItemPrice(
      { tipo: "Torcedor", time: "Time A" },
      { tamanho: "M", personalizado: false },
      { ...serverConfig, promocoes_time: { "Time A": { tipo: "porcentagem", valor: 10, ends_at: activeEndsAt } } },
    )).toEqual({ preco: 90, precoBase: 100 });
  });
});

import { describe, it, expect } from "vitest";
import {
  getPrecoProduto,
  calcularPreco,
  formatarMoeda,
  gerarId,
  montarMensagemPacote,
  DEFAULT_CONFIG,
  ADICIONAL_TAMANHO,
  PRECO_PERSONALIZACAO,
  TAMANHO_FORNECEDOR,
  type LojaConfig,
  type Order,
  type OrderItem,
} from "../types";
import { montarNome } from "../ProdutoForm";

// ---------------------------------------------------------------------------
// Helper to create a config with specific category-level promo active
// ---------------------------------------------------------------------------
function categoriaEmPromocao(tipo: string, ativa = true): LojaConfig {
  return {
    ...DEFAULT_CONFIG,
    promocao_ativa: { ...DEFAULT_CONFIG.promocao_ativa, [tipo]: ativa },
  };
}

// ---------------------------------------------------------------------------
// getPrecoProduto
// ---------------------------------------------------------------------------
describe("getPrecoProduto", () => {
  // ── Individual product promos ──

  it("returns base when no promo info given and category promo is off", () => {
    const r = getPrecoProduto("Jogador", DEFAULT_CONFIG);
    expect(r.base).toBe(169.90);
    expect(r.promo).toBeNull();
    expect(r.emPromocao).toBe(false);
    expect(r.promocaoTipo).toBeNull();
    expect(r.badge).toBeNull();
  });

  it("applies porcentagem promo", () => {
    const r = getPrecoProduto("Jogador", DEFAULT_CONFIG, null, "porcentagem", 10);
    const expected = Math.round((169.90 - 169.90 * 0.1) * 100) / 100;
    expect(r.base).toBe(169.90);
    expect(r.promo).toBe(expected);
    expect(r.emPromocao).toBe(true);
    expect(r.promocaoTipo).toBe("porcentagem");
    expect(r.promocaoValor).toBe(10);
    expect(r.badge).toBe("PROMO");
    expect(r.discountLabel).toBe("10% OFF");
  });

  it("applies porcentagem promo with custom base", () => {
    const r = getPrecoProduto("Jogador", DEFAULT_CONFIG, 199.90, "porcentagem", 15);
    const expected = Math.round((199.90 - 199.90 * 0.15) * 100) / 100;
    expect(r.base).toBe(199.90);
    expect(r.promo).toBe(expected);
    expect(r.badge).toBe("PROMO");
    expect(r.discountLabel).toBe("15% OFF");
  });

  it("applies novo_preco promo", () => {
    const r = getPrecoProduto("Jogador", DEFAULT_CONFIG, 139.90, "novo_preco");
    expect(r.base).toBe(169.90);
    expect(r.promo).toBe(139.90);
    expect(r.emPromocao).toBe(true);
    expect(r.promocaoTipo).toBe("novo_preco");
    expect(r.promocaoValor).toBeNull();
    expect(r.badge).toBe("PROMO");
    expect(r.discountLabel).toBe("18% OFF"); // (169.90-139.90)/169.90 ≈ 17.66% → rounded 18%
  });

  it("applies novo_preco with 0 discount (same price)", () => {
    const r = getPrecoProduto("Torcedor", DEFAULT_CONFIG, 129.90, "novo_preco");
    expect(r.base).toBe(129.90);
    expect(r.promo).toBe(129.90);
    expect(r.emPromocao).toBe(true);
    expect(r.badge).toBe("PROMO");
    expect(r.discountLabel).toBe("0% OFF");
  });

  it("applies leve_pague promo", () => {
    const r = getPrecoProduto("Torcedor", DEFAULT_CONFIG, null, "leve_pague");
    expect(r.base).toBe(129.90);
    expect(r.promo).toBeNull();
    expect(r.emPromocao).toBe(true);
    expect(r.promocaoTipo).toBe("leve_pague");
    expect(r.badge).toBe("PROMO");
    expect(r.discountLabel).toBe("50% OFF");
  });

  it("applies leve_3_pague_2 promo", () => {
    const r = getPrecoProduto("Torcedor", DEFAULT_CONFIG, null, "leve_3_pague_2");
    expect(r.base).toBe(129.90);
    expect(r.promo).toBeNull();
    expect(r.emPromocao).toBe(true);
    expect(r.promocaoTipo).toBe("leve_3_pague_2");
    expect(r.badge).toBe("PROMO");
    expect(r.discountLabel).toBe("33% OFF");
  });

  // Individual product promos take priority over category promos
  it("gives priority to individual promo over category promo", () => {
    const cfg = categoriaEmPromocao("Torcedor", true);
    const r = getPrecoProduto("Torcedor", cfg, null, "porcentagem", 25);
    expect(r.badge).toBe("PROMO");
    expect(r.discountLabel).toBe("25% OFF");
    expect(r.promocaoTipo).toBe("porcentagem");
    expect(r.promo).toBeLessThan(r.base);
  });

  // ── Category-level promo ──

  it("applies category-level promo when promocao_ativa is true", () => {
    const r = getPrecoProduto("Torcedor", categoriaEmPromocao("Torcedor", true));
    expect(r.base).toBe(129.90);
    expect(r.promo).toBe(109.90);
    expect(r.emPromocao).toBe(true);
    expect(r.promocaoTipo).toBeNull();
    expect(r.promocaoValor).toBeNull();
    expect(r.badge).toBe("PROMO");
    expect(r.discountLabel).toBe("15% OFF");
  });

  it("does not apply category-level promo when promocao_ativa is false", () => {
    const r = getPrecoProduto("Torcedor", categoriaEmPromocao("Torcedor", false));
    expect(r.base).toBe(129.90);
    expect(r.promo).toBeNull();
    expect(r.emPromocao).toBe(false);
    expect(r.badge).toBeNull();
  });

  // ── Unknown / fallback ──

  it("uses fallback base price for unknown tipo", () => {
    const r = getPrecoProduto("TipoDesconhecido", DEFAULT_CONFIG);
    expect(r.base).toBe(89.90);
    expect(r.promo).toBeNull();
  });

  it("uses custom precoCustomizado as base when provided", () => {
    const r = getPrecoProduto("NBA", DEFAULT_CONFIG, 250.00);
    expect(r.base).toBe(250.00);
    expect(r.promo).toBeNull();
  });

  // ── Edge: porcentagem with null valor does NOT apply ──

  it("does not apply porcentagem when valor is null/undefined", () => {
    const r = getPrecoProduto("Jogador", DEFAULT_CONFIG, null, "porcentagem", null);
    expect(r.promo).toBeNull();
    expect(r.emPromocao).toBe(false);
  });

  it("does not apply porcentagem when valor is 0", () => {
    const r = getPrecoProduto("Jogador", DEFAULT_CONFIG, null, "porcentagem", 0);
    expect(r.promo).toBeNull();
    expect(r.emPromocao).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calcularPreco
// ---------------------------------------------------------------------------
describe("calcularPreco", () => {
  it("returns base price for standard size without personalization", () => {
    expect(calcularPreco("Torcedor", "M", false)).toBe(129.90);
  });

  it("adds surcharge for 3XL", () => {
    expect(calcularPreco("Torcedor", "3XL", false)).toBe(129.90 + ADICIONAL_TAMANHO["3XL"]);
  });

  it("adds surcharge for 4XL", () => {
    expect(calcularPreco("Torcedor", "4XL", false)).toBe(129.90 + ADICIONAL_TAMANHO["4XL"]);
  });

  it("no surcharge for standard sizes (S, M, L, XL, 2XL)", () => {
    for (const size of ["S", "M", "L", "XL", "2XL"]) {
      expect(calcularPreco("Torcedor", size, false)).toBe(129.90);
    }
  });

  it("adds personalization cost", () => {
    expect(calcularPreco("Jogador", "M", true)).toBe(169.90 + PRECO_PERSONALIZACAO);
  });

  it("adds both size surcharge and personalization", () => {
    expect(calcularPreco("Jogador", "4XL", true)).toBe(169.90 + ADICIONAL_TAMANHO["4XL"] + PRECO_PERSONALIZACAO);
  });

  it("applies porcentagem promo before size/personalization surcharges", () => {
    const precoPromo = Math.round((169.90 - 169.90 * 0.2) * 100) / 100;
    const expected = precoPromo + ADICIONAL_TAMANHO["3XL"] + PRECO_PERSONALIZACAO;
    expect(calcularPreco("Jogador", "3XL", true, undefined, null, "porcentagem", 20)).toBe(expected);
  });

  it("applies category promo with size surcharge", () => {
    const cfg = categoriaEmPromocao("Jogador", true);
    const expected = 139.90 + ADICIONAL_TAMANHO["4XL"];
    expect(calcularPreco("Jogador", "4XL", false, cfg)).toBe(expected);
  });

  it("uses custom precoCustomizado when provided (novo_preco)", () => {
    expect(calcularPreco("NBA", "M", false, undefined, 159.90, "novo_preco")).toBe(159.90);
  });

  it("returns base price for unknown type with size surcharge", () => {
    expect(calcularPreco("Desconhecido", "3XL", false)).toBe(89.90 + ADICIONAL_TAMANHO["3XL"]);
  });

  it("leve_pague promo returns base price (promo is null, so base used) plus surcharges", () => {
    expect(calcularPreco("Torcedor", "M", false, undefined, null, "leve_pague")).toBe(129.90);
  });
});

// ---------------------------------------------------------------------------
// formatarMoeda
// ---------------------------------------------------------------------------
describe("formatarMoeda", () => {
  it("formats whole number in BRL", () => {
    expect(formatarMoeda(129.90)).toBe("R$ 129,90");
  });

  it("formats zero", () => {
    expect(formatarMoeda(0)).toBe("R$ 0,00");
  });

  it("formats large values", () => {
    expect(formatarMoeda(1234.56)).toBe("R$ 1.234,56");
  });

  it("formats values with no cents", () => {
    expect(formatarMoeda(100)).toBe("R$ 100,00");
  });

  it("formats very small decimal", () => {
    expect(formatarMoeda(0.5)).toBe("R$ 0,50");
  });

  it("formats thousands with grouping", () => {
    expect(formatarMoeda(10000)).toBe("R$ 10.000,00");
  });
});

// ---------------------------------------------------------------------------
// gerarId
// ---------------------------------------------------------------------------
describe("gerarId", () => {
  it("starts with UL-", () => {
    expect(gerarId()).toMatch(/^UL-/);
  });

  it("has total length of 11 characters (UL- + 8)", () => {
    const id = gerarId();
    expect(id.length).toBe(11);
  });

  it("contains only valid characters after UL-", () => {
    const id = gerarId();
    const suffix = id.slice(3);
    expect(suffix).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("excludes easily confused chars (0, O, I, 1)", () => {
    const id = gerarId();
    const suffix = id.slice(3);
    expect(suffix).not.toContain("0");
    expect(suffix).not.toContain("O");
    expect(suffix).not.toContain("I");
    expect(suffix).not.toContain("1");
  });

  it("generates unique IDs over multiple calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(gerarId());
    }
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// montarMensagemPacote
// ---------------------------------------------------------------------------
describe("montarMensagemPacote", () => {
  const baseItem: OrderItem = {
    nome: "Camisa Flamengo 2025 Versão Torcedor",
    tipo: "Torcedor",
    temporada: "25/26",
    tamanho: "M",
    genero: "Masculino",
    personalizado: false,
    preco: 129.90,
    yupooUrl: "https://yupoo.com/item123",
    feminino: false,
  };

  function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
      id: "UL-TEST1234",
      data: "24/05/2026",
      hora: "14:30",
      itens: [baseItem],
      total: 129.90,
      status: "pendente",
      ...overrides,
    };
  }

  it("includes order header and item details for single order", () => {
    const msg = montarMensagemPacote([makeOrder()]);
    expect(msg).toContain("*Pacote RM Imports*");
    expect(msg).toContain("1 pedido(s) • 1 camisa(s)");
    expect(msg).toContain("*Pedido UL-TEST1234*");
    expect(msg).toContain("Link: https://yupoo.com/item123");
    expect(msg).toContain("Size: M");
    expect(msg).toContain("Patch: 25/26");
    expect(msg).toContain("Version: Fan MALE");
    expect(msg).toContain("Total: 1 camisa(s) em 1 pedido(s)");
  });

  it("maps tamanho via TAMANHO_FORNECEDOR", () => {
    const item = { ...baseItem, tamanho: "3XL" };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).toContain(`Size: ${TAMANHO_FORNECEDOR["3XL"]}`);
  });

  it("falls back to original tamanho when not in TAMANHO_FORNECEDOR", () => {
    const item = { ...baseItem, tamanho: "XXL" };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).toContain("Size: XXL");
  });

  it("includes WOMANS version when feminino is true and genero is Feminino", () => {
    const item = { ...baseItem, feminino: true, genero: "Feminino" };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).toContain("Version: Fan WOMANS");
  });

  it("includes personalization details when item is personalized", () => {
    const item = {
      ...baseItem,
      personalizado: true,
      nomePersonalizado: "RAFAEL",
      numeroPersonalizado: "10",
    };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).toContain("Name: RAFAEL");
    expect(msg).toContain("Number: 10");
  });

  it("ommits personalization when not applicable", () => {
    const msg = montarMensagemPacote([makeOrder()]);
    expect(msg).not.toContain("Name:");
    expect(msg).not.toContain("Number:");
  });

  it("handles multiple orders", () => {
    const order1 = makeOrder({ id: "UL-AAAA1111", itens: [baseItem] });
    const order2 = makeOrder({ id: "UL-BBBB2222", itens: [baseItem, baseItem] });
    const msg = montarMensagemPacote([order1, order2]);
    expect(msg).toContain("2 pedido(s) • 3 camisa(s)");
    expect(msg).toContain("*Pedido UL-AAAA1111*");
    expect(msg).toContain("*Pedido UL-BBBB2222*");
    expect(msg).toContain("Total: 3 camisa(s) em 2 pedido(s)");
  });

  it("uses N/A when yupooUrl is empty", () => {
    const item = { ...baseItem, yupooUrl: "" };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).toContain("Link: N/A");
  });

  it("includes the Retrô mapping (Retro) for tipo", () => {
    const item = { ...baseItem, tipo: "Retrô" };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).toContain("Version: Retro MALE");
  });

  it("omits Patch line when temporada is empty", () => {
    const item = { ...baseItem, temporada: "" };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).not.toContain("Patch:");
  });
});

// ---------------------------------------------------------------------------
// montarNome (from ProdutoForm)
// ---------------------------------------------------------------------------
describe("montarNome", () => {
  it("returns empty string when essential fields are missing", () => {
    expect(montarNome("", "Torcedor", "25/26", "", "", "camisa")).toBe("");
    expect(montarNome("Flamengo", "", "25/26", "", "", "camisa")).toBe("");
    expect(montarNome("Flamengo", "Torcedor", "", "", "", "camisa")).toBe("");
  });

  it("returns custom name when nomeCustom is provided", () => {
    expect(montarNome("Flamengo", "Torcedor", "25/26", "CAMISA ESPECIAL", "", "camisa")).toBe("CAMISA ESPECIAL");
  });

  it('builds name with "Camisa" for non-retro camisa', () => {
    expect(montarNome("Flamengo", "Torcedor", "25/26", "", "", "camisa")).toBe(
      "Camisa Flamengo 25/26 Versão Torcedor"
    );
  });

  it('builds name with "Regata" for regata peca', () => {
    expect(montarNome("Flamengo", "Torcedor", "25/26", "", "", "regata")).toBe(
      "Regata Flamengo 25/26 Versão Torcedor"
    );
  });

  it('builds name with "Retrô" for retro tipo', () => {
    expect(montarNome("Flamengo", "Retrô", "2008", "", "", "camisa")).toBe(
      "Camisa Flamengo 2008 Retrô"
    );
  });

  it('builds name with "Regata Retrô" for regata retro', () => {
    expect(montarNome("Flamengo", "Retrô", "2008", "", "", "regata")).toBe(
      "Regata Flamengo 2008 Retrô"
    );
  });

  it("includes localizacao in parentheses when provided", () => {
    expect(montarNome("Flamengo", "Torcedor", "25/26", "", "Casa", "camisa")).toBe(
      "Camisa Flamengo 25/26 Versão Torcedor (Casa)"
    );
  });

  it("includes localizacao for retro as well", () => {
    expect(montarNome("Flamengo", "Retrô", "2008", "", "Fora", "camisa")).toBe(
      "Camisa Flamengo 2008 Retrô (Fora)"
    );
  });

  it("does not add empty parentheses when localizacao is empty", () => {
    const result = montarNome("Flamengo", "Torcedor", "25/26", "", "", "camisa");
    expect(result).not.toContain("()");
  });

  it("handles Jogador tipo with regata", () => {
    expect(montarNome("Brasil", "Jogador", "2026", "", "", "regata")).toBe(
      "Regata Brasil 2026 Versão Jogador"
    );
  });
});

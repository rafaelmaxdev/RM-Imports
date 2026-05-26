import { describe, it, expect } from "vitest";
import {
  getPrecoProduto,
  calcularPreco,
  formatarMoeda,
  gerarId,
  montarMensagemPacote,
  montarMensagemItem,
  DEFAULT_CONFIG,
  ADICIONAL_TAMANHO,
  PRECO_PERSONALIZACAO,
  TAMANHO_FORNECEDOR,
  type LojaConfig,
  type Order,
  type OrderItem,
} from "../types";
import { montarNome, isRetro, formatarValor } from "../ProdutoForm";
import { parseAnoTemporada } from "../Loja";

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

  it("adds surcharge for G2", () => {
    expect(calcularPreco("Torcedor", "G2", false)).toBe(129.90 + ADICIONAL_TAMANHO["G2"]);
  });

  it("adds surcharge for G3", () => {
    expect(calcularPreco("Torcedor", "G3", false)).toBe(129.90 + ADICIONAL_TAMANHO["G3"]);
  });

  it("no surcharge for standard sizes (P, M, G, GG, G1)", () => {
    for (const size of ["P", "M", "G", "GG", "G1"]) {
      expect(calcularPreco("Torcedor", size, false)).toBe(129.90);
    }
  });

  it("adds personalization cost", () => {
    expect(calcularPreco("Jogador", "M", true)).toBe(169.90 + PRECO_PERSONALIZACAO);
  });

  it("adds both size surcharge and personalization", () => {
    expect(calcularPreco("Jogador", "G3", true)).toBe(169.90 + ADICIONAL_TAMANHO["G3"] + PRECO_PERSONALIZACAO);
  });

  it("applies porcentagem promo before size/personalization surcharges", () => {
    const precoPromo = Math.round((169.90 - 169.90 * 0.2) * 100) / 100;
    const expected = precoPromo + ADICIONAL_TAMANHO["G2"] + PRECO_PERSONALIZACAO;
    expect(calcularPreco("Jogador", "G2", true, undefined, null, "porcentagem", 20)).toBe(expected);
  });

  it("applies category promo with size surcharge", () => {
    const cfg = categoriaEmPromocao("Jogador", true);
    const expected = 139.90 + ADICIONAL_TAMANHO["G3"];
    expect(calcularPreco("Jogador", "G3", false, cfg)).toBe(expected);
  });

  it("uses custom precoCustomizado when provided (novo_preco)", () => {
    expect(calcularPreco("NBA", "M", false, undefined, 159.90, "novo_preco")).toBe(159.90);
  });

  it("returns base price for unknown type with size surcharge", () => {
    expect(calcularPreco("Desconhecido", "G2", false)).toBe(89.90 + ADICIONAL_TAMANHO["G2"]);
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
    temporada: "2025/2026",
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
    expect(msg).toContain("Size: M");
    expect(msg).toContain("Version: Fan");
  });

  it("maps tamanho via TAMANHO_FORNECEDOR", () => {
    const item = { ...baseItem, tamanho: "G2" };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).toContain(`Size: ${TAMANHO_FORNECEDOR["G2"]}`);
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
    expect(msg).toContain("Version: Fan WOMENS");
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
    expect(msg).toContain("-------");
  });

  it("uses N/A when yupooUrl is empty", () => {
    const item = { ...baseItem, yupooUrl: "" };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).not.toContain("Link:");
  });

  it("includes the Retrô mapping (Retro) for tipo", () => {
    const item = { ...baseItem, tipo: "Retrô" };
    const order = makeOrder({ itens: [item] });
    const msg = montarMensagemPacote([order]);
    expect(msg).toContain("Version: Retro");
  });

  it("does not include resumo section", () => {
    const msg = montarMensagemPacote([makeOrder()]);
    expect(msg).not.toContain("Resumo do Pacote:");
  });
});

// ---------------------------------------------------------------------------
// montarMensagemItem
// ---------------------------------------------------------------------------
describe("montarMensagemItem", () => {
  const baseItem: OrderItem = {
    nome: "Camisa Flamengo 2025 Versão Torcedor",
    tipo: "Torcedor",
    temporada: "2025/2026",
    tamanho: "M",
    genero: "Masculino",
    personalizado: false,
    preco: 129.90,
    yupooUrl: "https://yupoo.com/item123",
    feminino: false,
  };

  it("formats basic item with Version and Size", () => {
    const msg = montarMensagemItem(baseItem);
    expect(msg).toBe("Version: Fan\nSize: M");
  });

  it("maps tamanho via TAMANHO_FORNECEDOR", () => {
    const item = { ...baseItem, tamanho: "GG" };
    expect(montarMensagemItem(item)).toContain(`Size: ${TAMANHO_FORNECEDOR["GG"]}`);
  });

  it("includes WOMENS version when feminino and genero is Feminino", () => {
    const item = { ...baseItem, feminino: true, genero: "Feminino" };
    expect(montarMensagemItem(item)).toContain("Version: Fan WOMENS");
  });

  it("does not include WOMENS when feminino but genero is not Feminino", () => {
    const item = { ...baseItem, feminino: true, genero: "Masculino" };
    expect(montarMensagemItem(item)).toContain("Version: Fan");
    expect(montarMensagemItem(item)).not.toContain("WOMENS");
  });

  it("includes personalization when item is personalized", () => {
    const item = {
      ...baseItem,
      personalizado: true,
      nomePersonalizado: "Jorge",
      numeroPersonalizado: "23",
    };
    const msg = montarMensagemItem(item);
    expect(msg).toContain("Name: Jorge");
    expect(msg).toContain("Number: 23");
  });

  it("omits personalization when not applicable", () => {
    const msg = montarMensagemItem(baseItem);
    expect(msg).not.toContain("Name:");
    expect(msg).not.toContain("Number:");
  });

  it("maps Retrò to Retro", () => {
    const item = { ...baseItem, tipo: "Retrô" };
    expect(montarMensagemItem(item)).toContain("Version: Retro");
  });
});

// ---------------------------------------------------------------------------
// montarNome (from ProdutoForm)
// ---------------------------------------------------------------------------
describe("montarNome", () => {
  it("returns empty string when essential fields are missing", () => {
    expect(montarNome("", "Torcedor", "2025/2026", "", "", "camisa")).toBe("");
    expect(montarNome("Flamengo", "", "2025/2026", "", "", "camisa")).toBe("");
    expect(montarNome("Flamengo", "Torcedor", "", "", "", "camisa")).toBe("");
  });

  it("returns custom name when nomeCustom is provided", () => {
    expect(montarNome("Flamengo", "Torcedor", "2025/2026", "CAMISA ESPECIAL", "", "camisa")).toBe("CAMISA ESPECIAL");
  });

  it('builds name with "Camisa" for non-retro camisa', () => {
    expect(montarNome("Flamengo", "Torcedor", "2025/2026", "", "", "camisa")).toBe(
      "Camisa Flamengo 2025/2026 Versão Torcedor"
    );
  });

  it('builds name with "Regata" for regata peca', () => {
    expect(montarNome("Flamengo", "Torcedor", "2025/2026", "", "", "regata")).toBe(
      "Regata Flamengo 2025/2026 Versão Torcedor"
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
    expect(montarNome("Flamengo", "Torcedor", "2025/2026", "", "Casa", "camisa")).toBe(
      "Camisa Flamengo 2025/2026 Versão Torcedor (Casa)"
    );
  });

  it("includes localizacao for retro as well", () => {
    expect(montarNome("Flamengo", "Retrô", "2008", "", "Fora", "camisa")).toBe(
      "Camisa Flamengo 2008 Retrô (Fora)"
    );
  });

  it("does not add empty parentheses when localizacao is empty", () => {
    const result = montarNome("Flamengo", "Torcedor", "2025/2026", "", "", "camisa");
    expect(result).not.toContain("()");
  });

  it("handles Jogador tipo with regata", () => {
    expect(montarNome("Brasil", "Jogador", "2026", "", "", "regata")).toBe(
      "Regata Brasil 2026 Versão Jogador"
    );
  });

  it("handles Seleções gap format (1992/1994)", () => {
    expect(montarNome("Brasil", "Retrô", "1992/1994", "", "", "camisa")).toBe(
      "Camisa Brasil 1992/1994 Retrô"
    );
  });

  it("handles Seleções gap format with localizacao", () => {
    expect(montarNome("Brasil", "Retrô", "1992/1994", "", "Casa", "camisa")).toBe(
      "Camisa Brasil 1992/1994 Retrô (Casa)"
    );
  });
});

// ---------------------------------------------------------------------------
// isRetro (from ProdutoForm)
// ---------------------------------------------------------------------------
describe("isRetro", () => {
  // Clubes (isAno=false): limite 2021
  it("returns false for current club season (2025/2026)", () => {
    expect(isRetro("2025/2026", false)).toBe(false);
  });

  it("returns true for old club season (2020/2021)", () => {
    expect(isRetro("2020/2021", false)).toBe(true);
  });

  it("returns true for club season exactly at cutoff (2021/2022)", () => {
    expect(isRetro("2021/2022", false)).toBe(true);
  });

  it("returns false for club season just above cutoff (2022/2023)", () => {
    expect(isRetro("2022/2023", false)).toBe(false);
  });

  it("handles short format for clubs (21/22 → retro)", () => {
    expect(isRetro("21/22", false)).toBe(true);
  });

  it("handles short format for clubs (25/26 → not retro)", () => {
    expect(isRetro("25/26", false)).toBe(false);
  });

  it("handles short format for clubs (98/99 → retro)", () => {
    expect(isRetro("98/99", false)).toBe(true);
  });

  // Seleções (isAno=true): limite 2022
  it("returns false for current Seleção year (2026)", () => {
    expect(isRetro("2026", true)).toBe(false);
  });

  it("returns true for old Seleção year (2020)", () => {
    expect(isRetro("2020", true)).toBe(true);
  });

  it("returns true for Seleção year exactly at cutoff (2022)", () => {
    expect(isRetro("2022", true)).toBe(true);
  });

  it("returns false for Seleção year just above cutoff (2023)", () => {
    expect(isRetro("2023", true)).toBe(false);
  });

  // Seleções com gap (1992/1994): usa o primeiro ano
  it("returns true for Seleção gap format (1992/1994)", () => {
    expect(isRetro("1992/1994", true)).toBe(true);
  });

  it("returns false for Seleção gap format (2024/2026)", () => {
    expect(isRetro("2024/2026", true)).toBe(false);
  });

  it("uses first year for retro check in Seleção gap (2022/2024 → retro)", () => {
    expect(isRetro("2022/2024", true)).toBe(true);
  });

  it("uses first year for retro check in Seleção gap (2023/2025 → not retro)", () => {
    expect(isRetro("2023/2025", true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseAnoTemporada (from Loja)
// ---------------------------------------------------------------------------
describe("parseAnoTemporada", () => {
  it("parses full year format (2025/2026)", () => {
    expect(parseAnoTemporada("2025/2026")).toBe(2025);
  });

  it("parses gap format (1992/1994)", () => {
    expect(parseAnoTemporada("1992/1994")).toBe(1992);
  });

  it("parses short format (25/26)", () => {
    expect(parseAnoTemporada("25/26")).toBe(2025);
  });

  it("parses short format for 90s (98/99)", () => {
    expect(parseAnoTemporada("98/99")).toBe(1998);
  });

  it("parses single year (2026)", () => {
    expect(parseAnoTemporada("2026")).toBe(2026);
  });

  it("returns 0 for invalid input", () => {
    expect(parseAnoTemporada("abc")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatarValor (from ProdutoForm)
// ---------------------------------------------------------------------------
describe("formatarValor", () => {
  it("allows digits and slash for temporada format", () => {
    expect(formatarValor("2025/2026")).toBe("2025/2026");
  });

  it("allows digits and slash for Seleção gap format", () => {
    expect(formatarValor("1992/1994")).toBe("1992/1994");
  });

  it("allows single year for Seleções", () => {
    expect(formatarValor("2026")).toBe("2026");
  });

  it("strips non-numeric characters except slash", () => {
    expect(formatarValor("20a2b5/2c0d2e6")).toBe("2025/2026");
  });

  it("handles short format", () => {
    expect(formatarValor("25/26")).toBe("25/26");
  });
});

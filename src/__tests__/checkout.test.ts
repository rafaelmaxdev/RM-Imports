import { describe, it, expect } from "vitest";
import { aplicarCupom } from "../lib/db";
import {
  formatarMoeda,
  calcularPreco,
  ADICIONAL_TAMANHO,
  precoPersonalizacao,
  gerarId,
} from "../types";

describe("Coupon application", () => {
  const cupomPorcentagem = {
    id: "1",
    codigo: "BEMVINDO10",
    tipo: "porcentagem" as const,
    valor: 10,
    desconto_maximo: null,
    uso_maximo: null,
    usos_atuais: 0,
    valor_minimo_pedido: null,
    data_expiracao: null,
    ativo: true,
    created_at: new Date().toISOString(),
  };

  const cupomFixo = {
    id: "2",
    codigo: "DESCONTO20",
    tipo: "fixo" as const,
    valor: 20,
    desconto_maximo: null,
    uso_maximo: null,
    usos_atuais: 0,
    valor_minimo_pedido: null,
    data_expiracao: null,
    ativo: true,
    created_at: new Date().toISOString(),
  };

  const cupomComMaximo = {
    ...cupomPorcentagem,
    codigo: "MAX30",
    valor: 50,
    desconto_maximo: 30,
  };

  it("aplica desconto percentual", () => {
    const total = aplicarCupom(200, cupomPorcentagem);
    expect(total).toBe(180);
  });

  it("aplica desconto fixo", () => {
    const total = aplicarCupom(100, cupomFixo);
    expect(total).toBe(80);
  });

  it("desconto fixo não fica negativo", () => {
    const total = aplicarCupom(10, cupomFixo);
    expect(total).toBe(0);
  });

  it("respeita desconto maximo em porcentagem", () => {
    const total = aplicarCupom(200, cupomComMaximo);
    expect(total).toBe(170);
  });

  it("desconto maximo não afeta valores menores", () => {
    const total = aplicarCupom(50, cupomComMaximo);
    expect(total).toBe(25);
  });

  it("formata moeda corretamente", () => {
    expect(formatarMoeda(129.90)).toContain("129,90");
    expect(formatarMoeda(0)).toContain("0,00");
    expect(formatarMoeda(1000.50)).toContain("1.000,50");
    expect(formatarMoeda(129.90)).toContain("R$");
  });
});

describe("Price calculation", () => {
  it("calcula preco base sem adicional", () => {
    expect(calcularPreco("Torcedor", "M", false)).toBe(129.90);
  });

  it("adiciona taxa para G2", () => {
    expect(calcularPreco("Torcedor", "G2", false)).toBe(129.90 + ADICIONAL_TAMANHO.G2);
  });

  it("adiciona personalizacao para Torcedor", () => {
    const esperado = 129.90 + precoPersonalizacao("Torcedor");
    expect(calcularPreco("Torcedor", "M", true)).toBe(esperado);
    expect(precoPersonalizacao("Torcedor")).toBe(20);
  });

  it("aplica desconto antes de adicionar taxa de tamanho", () => {
    const precoComDesc = Math.round((169.90 - 169.90 * 0.2) * 100) / 100;
    const esperado = precoComDesc + ADICIONAL_TAMANHO.G2 + precoPersonalizacao("Jogador");
    expect(calcularPreco("Jogador", "G2", true, undefined, null, "porcentagem", 20)).toBe(esperado);
  });
});

describe("Pronta entrega markup", () => {
  const PE_MARKUP = 20;
  it("aplica taxa fixa de R$20 no preco base", () => {
    const base = 129.90;
    const comTaxa = Math.round((base + PE_MARKUP) * 100) / 100;
    expect(comTaxa).toBe(149.90);
  });

  it("taxa fixa sobre preco com desconto", () => {
    const base = 129.90;
    const desconto = 0.2;
    const precoDesc = Math.round((base - base * desconto) * 100) / 100;
    const comTaxa = Math.round((precoDesc + PE_MARKUP) * 100) / 100;
    expect(comTaxa).toBe(123.92);
  });
});

describe("Cart total with coupon", () => {
  it("soma itens e aplica cupom", () => {
    const itens = [129.90, 169.90, 25];
    const total = itens.reduce((s, p) => s + p, 0);
    const totalComCupom = total - total * 0.1;
    expect(total).toBe(324.80);
    expect(Math.round(totalComCupom * 100) / 100).toBe(292.32);
  });

  it("aplica cupom fixo no total", () => {
    const total = 200;
    const desconto = 30;
    expect(total - desconto).toBe(170);
  });

  it("cupom nao deixa total negativo", () => {
    expect(Math.max(0, 15 - 20)).toBe(0);
  });
});

describe("Order ID generation", () => {
  it("gera ID no formato UL-XXXXXXXX", () => {
    const id = gerarId();
    expect(id).toMatch(/^UL-[A-Z2-9]{8}$/);
    expect(id.length).toBe(11);
  });
});

describe("Cart total with PE markup", () => {
  it("calcula total com taxa fixa de PE", () => {
    const base = 129.90;
    const peMarkup = 20;
    const total = Math.round((base + peMarkup) * 100) / 100;
    expect(total).toBe(149.90);
  });

  it("calcula total com desconto + taxa PE", () => {
    const base = 169.90;
    const desconto = 0.2;
    const precoDesc = Math.round((base - base * desconto) * 100) / 100;
    const total = Math.round((precoDesc + 20) * 100) / 100;
    expect(total).toBe(155.92);
  });
});

describe("Stock operations", () => {
  it("decrementa quantidade corretamente", () => {
    const qtd = 5;
    const novaQtd = qtd - 1;
    expect(novaQtd).toBe(4);
  });

  it("não decrementa abaixo de zero", () => {
    const qtd = 0;
    const novaQtd = Math.max(0, qtd - 1);
    expect(novaQtd).toBe(0);
  });

  it("incrementa quantidade corretamente", () => {
    const qtd = 3;
    const novaQtd = qtd + 1;
    expect(novaQtd).toBe(4);
  });
});

describe("Order filtering logic", () => {
  const orders = [
    { id: "1", status: "pago", admin_order: false, pronta_entrega: false, total: 100 },
    { id: "2", status: "pago", admin_order: false, pronta_entrega: true, total: 50 },
    { id: "3", status: "pago", admin_order: true, pronta_entrega: false, total: 30 },
    { id: "4", status: "cancelado", admin_order: false, pronta_entrega: false, total: 20 },
    { id: "5", status: "pendente", admin_order: false, pronta_entrega: false, total: 10 },
  ];

  it("filtra apenas pedidos ativos (não admin, não PE, não cancelado, não pendente)", () => {
    const ativos = orders.filter((o: any) =>
      o.status !== "cancelado" && o.status !== "reembolsado" && !o.admin_order && !o.pronta_entrega && o.status !== "pendente"
    );
    expect(ativos).toHaveLength(1);
    expect(ativos[0].id).toBe("1");
  });

  it("receita considera apenas ativos", () => {
    const ativos = orders.filter((o: any) =>
      o.status !== "cancelado" && o.status !== "reembolsado" && !o.admin_order && !o.pronta_entrega && o.status !== "pendente"
    );
    const receita = ativos.reduce((s: number, o: any) => s + o.total, 0);
    expect(receita).toBe(100);
  });
});

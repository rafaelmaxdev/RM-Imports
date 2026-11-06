import { describe, expect, it } from "vitest";
import {
  calculateOwnerBalances,
  calculateOwnerProfit,
  getPaymentOrdersForVerification,
  OWNER_FINANCE_INPUT_ERROR,
  parseBRLToCents,
} from "../../server/lib/owner-finance";

type Source = Record<string, unknown>;

const item = (overrides: Source = {}): Source => ({
  productId: "product-1",
  nome: "Produto 1",
  tipo: "Camisa",
  tamanho: "M",
  personalizado: false,
  feminino: false,
  nomePersonalizado: null,
  numeroPersonalizado: null,
  ...overrides,
});

const order = (id: string, overrides: Source = {}): Source => ({
  id,
  status: "entregue",
  total: 200,
  itens: [item()],
  admin_order: false,
  reposicao: false,
  pronta_entrega: false,
  payment_method: "pix",
  mp_payment_id: null,
  comissao_calculada: null,
  rev_share_percentual: null,
  ...overrides,
});

const source = (overrides: Source = {}): Source => ({
  orders: [],
  packages: [],
  stock: [],
  products: [],
  config: [],
  extras: [],
  ...overrides,
});

const packaged = (orders: Source[], overrides: Source = {}): Source => ({
  ...source({ orders }),
  packages: [{ id: "package-1", pedido_ids: orders.map((value) => value.id), custo: 100, frete: 10, taxa_importacao: 5, ...overrides }],
});

const peStock = (cost: number | null = 50): Source => ({
  produto_id: "product-1",
  tamanho: "M",
  custo: cost,
  personalizado: false,
  feminino: false,
  nome_personalizado: null,
  numero_personalizado: null,
});

it("uses saved shirt costs to apportion all package expenses before and after delivery", () => {
  const first = order("first");
  const second = order("second", { status: "a_caminho" });
  const costs = { custo: 100, frete: 10, taxa_importacao: 5, custos_itens_usd: { "first-0": 15, "second-0": 5 } };
  expect(calculateOwnerProfit(packaged([first, second], costs), new Map())).toMatchObject({
    eligibleOrderCount: 1, pendingOrderCount: 1, productCostCents: 7500,
    shippingCostCents: 750, importCostCents: 375, profitCents: 11375,
  });
  expect(calculateOwnerProfit(packaged([first, { ...second, status: "entregue" }], costs), new Map())).toMatchObject({
    eligibleOrderCount: 2, productCostCents: 10000, shippingCostCents: 1000, importCostCents: 500, profitCents: 28500,
  });
});

describe("parseBRLToCents", () => {
  it.each([
    ["10", 1000],
    ["10,50", 1050],
    ["10.50", 1050],
    ["0,01", 1],
  ])("parses %s", (raw, expected) => {
    expect(parseBRLToCents(raw)).toBe(expected);
  });

  it.each(["0", "-1", "1.234", "10,000", "NaN", "Infinity", "R$ 10", ""]) (
    "rejects %s",
    (raw) => expect(parseBRLToCents(raw)).toBeNull(),
  );
});

describe("calculateOwnerBalances", () => {
  it("divides BRL 1,000 into 300/300 and retains 400", () => {
    const result = calculateOwnerBalances(100_000, []);
    expect(result.retainedStoreCents).toBe(40_000);
    expect(result.owners.rafael).toEqual({ entitlementCents: 30_000, withdrawnCents: 0, balanceCents: 30_000 });
    expect(result.owners.renan).toEqual({ entitlementCents: 30_000, withdrawnCents: 0, balanceCents: 30_000 });
  });

  it("keeps a one-cent remainder in the store", () => {
    const result = calculateOwnerBalances(1, []);
    expect(result.retainedStoreCents).toBe(1);
    expect(result.owners.rafael.entitlementCents).toBe(0);
  });

  it("does not distribute a negative profit", () => {
    const result = calculateOwnerBalances(-10_000, []);
    expect(result.retainedStoreCents).toBe(0);
    expect(result.owners.rafael.entitlementCents).toBe(0);
    expect(result.owners.renan.entitlementCents).toBe(0);
  });

  it("keeps withdrawals independent between owners", () => {
    const result = calculateOwnerBalances(100_000, [{ owner: "rafael", amount_cents: 10_000, voided_at: null }]);
    expect(result.owners.rafael.balanceCents).toBe(20_000);
    expect(result.owners.renan.balanceCents).toBe(30_000);
  });

  it("ignores voided withdrawals", () => {
    const result = calculateOwnerBalances(100_000, [
      { owner: "rafael", amount_cents: 10_000, voided_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(result.owners.rafael.withdrawnCents).toBe(0);
    expect(result.owners.rafael.balanceCents).toBe(30_000);
  });
});

describe("calculateOwnerProfit", () => {
  it("keeps package allocation exact with fractional USD weights", () => {
    const data = packaged([
      order("order-1", { itens: [item({ tipo: "A" })] }),
      order("order-2", { itens: [item({ tipo: "B" })] }),
      order("order-3", { itens: [item({ tipo: "C" })] }),
    ], { custo: 100.01, frete: 0, taxa_importacao: 0 });
    data.config = [{ key: "custo_base", value: { A: 0.07, B: 0.11, C: 0.23 } }];
    const result = calculateOwnerProfit(data, new Map());
    expect(result.productCostCents).toBe(10001);
    expect(result.eligibleOrderCount).toBe(3);
    expect(result.profitCents).toBe(49999);
  });

  it("fails closed when the source snapshot is incomplete", () => {
    expect(() => calculateOwnerProfit({ orders: [] }, new Map())).toThrow(OWNER_FINANCE_INPUT_ERROR);
    expect(() => getPaymentOrdersForVerification({ orders: [] })).toThrow(OWNER_FINANCE_INPUT_ERROR);
  });

  it("does not treat an absent extras array as zero", () => {
    const incomplete = source({ orders: [order("o1")] });
    delete incomplete.extras;
    expect(() => calculateOwnerProfit(incomplete, new Map())).toThrow(OWNER_FINANCE_INPUT_ERROR);
  });

  it("calculates a known delivered package profit", () => {
    const result = calculateOwnerProfit(packaged([order("o1")]), new Map());
    expect(result).toMatchObject({
      profitCents: 8_500,
      revenueCents: 20_000,
      productCostCents: 10_000,
      shippingCostCents: 1_000,
      importCostCents: 500,
      eligibleOrderCount: 1,
    });
  });

  it("excludes admin, reposição and pending orders from realized counters", () => {
    const result = calculateOwnerProfit(packaged([
      order("sale"),
      order("admin", { admin_order: true, total: 900 }),
      order("stock", { reposicao: true, total: 800 }),
      order("pending", { status: "pago", total: 700 }),
      order("cancelled", { status: "cancelado", total: 600 }),
      order("refunded", { status: "reembolsado", total: 500 }),
    ]), new Map());
    expect(result.eligibleOrderCount).toBe(1);
    expect(result.revenueCents).toBe(20_000);
    expect(result.pendingOrderCount).toBe(1);
    expect(result.pendingRevenueCents).toBe(70_000);
  });

  it("ignores unknown statuses", () => {
    const result = calculateOwnerProfit(source({ orders: [order("unknown", { status: "new_status" })] }), new Map());
    expect(result).toMatchObject({ eligibleOrderCount: 0, awaitingCostCount: 0, pendingOrderCount: 0, revenueCents: 0 });
  });

  it("reports pending revenue without treating it as profit", () => {
    const result = calculateOwnerProfit(source({ orders: [order("o1", { status: "em_entrega", total: 100 })] }), new Map());
    expect(result.pendingOrderCount).toBe(1);
    expect(result.pendingRevenueCents).toBe(10_000);
    expect(result.profitCents).toBe(0);
  });

  it.each(["frete", "taxa_importacao"]) ("blocks nullable %s", (field) => {
    const result = calculateOwnerProfit(packaged([order("o1")], { [field]: null }), new Map());
    expect(result.awaitingCostCount).toBe(1);
    expect(result.eligibleOrderCount).toBe(0);
  });

  it("accepts explicit zero freight and import costs", () => {
    const result = calculateOwnerProfit(packaged([order("o1")], { frete: 0, taxa_importacao: 0 }), new Map());
    expect(result.eligibleOrderCount).toBe(1);
    expect(result.shippingCostCents).toBe(0);
    expect(result.importCostCents).toBe(0);
  });

  it("uses authoritative package cost while config only changes allocation weights", () => {
    const orders = [order("o1"), order("o2")];
    const first = packaged(orders);
    first.config = [{ key: "custo_base", value: { Camisa: 1 } }];
    const second = packaged(orders);
    second.config = [{ key: "custo_base", value: { Camisa: 999 } }];
    expect(calculateOwnerProfit(first, new Map()).productCostCents).toBe(10_000);
    expect(calculateOwnerProfit(second, new Map()).productCostCents).toBe(10_000);
  });

  it("allocates a BRL 1,000 package as 300/300/400 by USD weight", () => {
    const types = ["A", "B", "C"];
    const expected = [30_000, 30_000, 40_000];
    for (let target = 0; target < types.length; target++) {
      const orders = types.map((type, index) => order(`o${index}`, {
        admin_order: index !== target,
        itens: [item({ tipo: type })],
      }));
      const source = packaged(orders, { custo: 1_000, frete: 0, taxa_importacao: 0 });
      source.config = [{ key: "custo_base", value: { A: 3, B: 3, C: 4 } }];
      expect(calculateOwnerProfit(source, new Map()).productCostCents).toBe(expected[target]);
    }
  });

  it("keeps the admin package share in the denominator", () => {
    const result = calculateOwnerProfit(packaged([
      order("sale"),
      order("admin", { admin_order: true }),
    ]), new Map());
    expect(result.productCostCents).toBe(5_000);
    expect(result.revenueCents).toBe(20_000);
  });

  it.each([
    ["duplicate member ids", ["o1", "o1"]],
    ["missing member id", ["o1", "missing"]],
  ])("awaits cost for %s", (_name, pedidoIds) => {
    const source = packaged([order("o1")]);
    (source.packages as Source[])[0].pedido_ids = pedidoIds;
    const result = calculateOwnerProfit(source, new Map());
    expect(result.awaitingCostCount).toBe(1);
  });

  it("awaits an unknown PE stock cost", () => {
    const result = calculateOwnerProfit(source({
      orders: [order("pe", { pronta_entrega: true })],
      stock: [],
      products: [],
      extras: [],
    }), new Map());
    expect(result.awaitingCostCount).toBe(1);
  });

  it("uses package cost before PE stock and does not double count it", () => {
    const source = packaged([order("pe", { pronta_entrega: true })]);
    source.stock = [peStock(1)];
    const result = calculateOwnerProfit(source, new Map());
    expect(result.productCostCents).toBe(10_000);
    expect(result.shippingCostCents).toBe(1_000);
  });

  it("deducts global extras once", () => {
    const source = packaged([order("o1"), order("o2")]);
    source.extras = [{ id: 1, quantidade: 2, preco: 10 }];
    const result = calculateOwnerProfit(source, new Map());
    expect(result.extraCostCents).toBe(2_000);
    expect(result.profitCents).toBe(26_500);
  });

  it("uses the verified MP fee instead of an estimate", () => {
    const source = packaged([order("o1", { mp_payment_id: "mp-1", payment_method: "credit_card" })]);
    const result = calculateOwnerProfit(source, new Map([["o1", 123]]));
    expect(result.mpFeeCents).toBe(123);
    expect(result.profitCents).toBe(8_377);
  });

  it("holds an MP order without a verified fee", () => {
    const source = packaged([order("o1", { mp_payment_id: "mp-1", payment_method: "credit_card" })]);
    const result = calculateOwnerProfit(source, new Map());
    expect(result.awaitingFeeCount).toBe(1);
    expect(result.eligibleOrderCount).toBe(0);
  });

  it("accepts an external PIX order with zero fee", () => {
    const result = calculateOwnerProfit(packaged([order("o1", { payment_method: "pix", mp_payment_id: null })]), new Map());
    expect(result.mpFeeCents).toBe(0);
    expect(result.eligibleOrderCount).toBe(1);
  });

  it("holds an external card order without a payment id", () => {
    const result = calculateOwnerProfit(packaged([order("o1", { payment_method: "debit_card", mp_payment_id: null })]), new Map());
    expect(result.awaitingFeeCount).toBe(1);
  });

  it("deducts a calculated commission", () => {
    const result = calculateOwnerProfit(packaged([order("o1", { rev_share_percentual: 10, comissao_calculada: 3 })]), new Map());
    expect(result.commissionCents).toBe(300);
    expect(result.profitCents).toBe(8_200);
  });

  it("awaits a missing commission when rev share is positive", () => {
    const result = calculateOwnerProfit(packaged([order("o1", { rev_share_percentual: 10, comissao_calculada: null })]), new Map());
    expect(result.awaitingCostCount).toBe(1);
  });

  it("rejects unsafe amounts and invalid extras with the fixed error", () => {
    expect(() => calculateOwnerProfit(source({ extras: [{ quantidade: 1, preco: Infinity }] }), new Map())).toThrow(OWNER_FINANCE_INPUT_ERROR);
    expect(() => calculateOwnerProfit(source(), new Map([["o1", -1]]))).toThrow(OWNER_FINANCE_INPUT_ERROR);
  });

  it("accepts a legacy JSON item array and awaits malformed JSON", () => {
    const valid = packaged([order("valid", { itens: JSON.stringify([item()]) })]);
    expect(calculateOwnerProfit(valid, new Map()).eligibleOrderCount).toBe(1);
    const invalid = packaged([order("invalid", { itens: "not-json" })]);
    expect(calculateOwnerProfit(invalid, new Map()).awaitingCostCount).toBe(1);
    const plainPackageId = packaged([order("plain")]);
    (plainPackageId.packages as Source[])[0].pedido_ids = "plain";
    expect(calculateOwnerProfit(plainPackageId, new Map()).awaitingCostCount).toBe(1);
  });

  it("closes cent rounding across every package allocation", () => {
    const source = packaged([order("o1", { itens: [item(), item(), item()] })], { custo: 0.01 });
    const result = calculateOwnerProfit(source, new Map());
    expect(result.productCostCents).toBe(1);
  });
});

describe("getPaymentOrdersForVerification", () => {
  it("returns only delivered non-admin/non-reposição MP orders", () => {
    const result = getPaymentOrdersForVerification(source({
      orders: [
        order("one", { mp_payment_id: "mp-1" }),
        order("pending", { status: "pago", mp_payment_id: "mp-2" }),
        order("admin", { admin_order: true, mp_payment_id: "mp-3" }),
        order("repo", { reposicao: true, mp_payment_id: "mp-4" }),
        order("pix", { mp_payment_id: null }),
      ],
    }));
    expect(result).toEqual([{ id: "one", mp_payment_id: "mp-1" }]);
  });
});

describe("input immutability and PE matching", () => {
  it("does not mutate sources while parsing legacy arrays", () => {
    const source = packaged([order("o1", { itens: JSON.stringify([item()]) })]);
    (source.packages as Source[])[0].pedido_ids = JSON.stringify(["o1"]);
    const before = JSON.stringify(source);
    calculateOwnerProfit(source, new Map());
    expect(JSON.stringify(source)).toBe(before);
  });

  it("matches normalized personalized names and gender fallback", () => {
    const input: Source = source({
      orders: [order("pe", {
        pronta_entrega: true,
        itens: [item({ feminino: undefined, genero: "F", personalizado: true, nomePersonalizado: "  Ana  ", numeroPersonalizado: "07" })],
      })],
      stock: [peStock(20)],
      products: [],
      extras: [],
    });
    input.stock = [{ ...(input.stock as Source[])[0], feminino: true, personalizado: true, nome_personalizado: " ana ", numero_personalizado: " 07 " }];
    expect(calculateOwnerProfit(input, new Map()).productCostCents).toBe(2_000);
  });

  it("does not choose the cheaper conflicting stock duplicate", () => {
    const result = calculateOwnerProfit(source({
      orders: [order("pe", { pronta_entrega: true })],
      stock: [peStock(20), peStock(19)],
      products: [],
      extras: [],
    }), new Map());
    expect(result.awaitingCostCount).toBe(1);
    expect(result.productCostCents).toBe(0);
  });

  it("accepts duplicate stock rows when their costs agree", () => {
    const result = calculateOwnerProfit(source({
      orders: [order("pe", { pronta_entrega: true })],
      stock: [peStock(20), peStock(20)],
      products: [],
      extras: [],
    }), new Map());
    expect(result.productCostCents).toBe(2_000);
    expect(result.eligibleOrderCount).toBe(1);
  });
});

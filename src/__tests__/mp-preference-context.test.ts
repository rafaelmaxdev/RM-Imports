import { describe, expect, it } from "vitest";
import { buildMercadoPagoPreferenceContext, normalizeMPDeviceId } from "../../server/lib/mp-preference-context";

const orderId = "UL-ABC12345";

describe("buildMercadoPagoPreferenceContext", () => {
  it.each([
    JSON.stringify([{ nome: "Santa Cruz", tipo: "Torcedor", tamanho: "M" }]),
    [{ nome: "Santa Cruz", tipo: "Torcedor", tamanho: "M" }],
  ])("accepts JSON legacy and parsed item arrays", (itens) => {
    expect(buildMercadoPagoPreferenceContext({ orderId, itens }).item).toEqual({
      title: "RM Imports — Camisa Santa Cruz",
      description: "Camisa Santa Cruz, tipo Torcedor, tamanho M",
      category_id: "fashion",
    });
  });

  it("does not duplicate the product's existing Camisa prefix", () => {
    const context = buildMercadoPagoPreferenceContext({
      orderId,
      itens: [{ nome: "Camisa Santa Cruz", tipo: "Torcedor", tamanho: "M" }],
    });

    expect(context.item).toMatchObject({
      title: "RM Imports — Camisa Santa Cruz",
      description: "Camisa Santa Cruz, tipo Torcedor, tamanho M",
    });
  });

  it("uses real item metadata without personalized values", () => {
    const context = buildMercadoPagoPreferenceContext({
      orderId,
      itens: [
        { nome: "Santa Cruz", tipo: "Torcedor", tamanho: "M", nomePersonalizado: "Ana", numeroPersonalizado: "10" },
        { nome: "Brasil", tipo: "Jogador", tamanho: "G" },
      ],
    });

    expect(context.item).toEqual({
      title: "RM Imports — 2 camisas",
      description: "Camisa Santa Cruz, tipo Torcedor, tamanho M; Camisa Brasil, tipo Jogador, tamanho G",
      category_id: "fashion",
    });
    expect(JSON.stringify(context)).not.toContain("Ana");
    expect(JSON.stringify(context)).not.toContain("10");
  });

  it("falls back safely for malformed JSON", () => {
    expect(buildMercadoPagoPreferenceContext({ orderId, itens: "not-json", endereco: "not-json" })).toEqual({
      item: { title: `Pedido ${orderId}`, description: `Pedido ${orderId}` },
      payer: undefined,
    });
  });

  it("normalizes private buyer identity for Mercado Pago", () => {
    const context = buildMercadoPagoPreferenceContext({
      orderId,
      itens: [],
      endereco: { nome: "Maria Silva", deliveryMethod: "retirada" },
      buyer: { email: "  Buyer@example.com ", cpf: "529.982.247-25" },
    });

    expect(context.payer).toMatchObject({
      name: "Maria",
      surname: "Silva",
      email: "Buyer@example.com",
      identification: { type: "CPF", number: "52998224725" },
    });
  });

  it("rejects an invalid private buyer without exposing validation details", () => {
    expect(() => buildMercadoPagoPreferenceContext({
      orderId,
      itens: [],
      buyer: { email: "invalid", cpf: "529.982.247-25" },
    })).toThrow("Dados do comprador inválidos.");
  });

  it("never uses legacy address email or CPF as payer identity", () => {
    const context = buildMercadoPagoPreferenceContext({
      orderId,
      itens: [],
      endereco: {
        nome: "Maria",
        email: "attacker@example.com",
        cpf: "52998224725",
        deliveryMethod: "retirada",
      },
    });

    expect(context.payer).toEqual({ name: "Maria" });
  });

  it("builds payer phone from national and saved country-code numbers", () => {
    const national = buildMercadoPagoPreferenceContext({
      orderId,
      itens: [],
      endereco: { nome: "Maria Silva", telefone: "(81) 99999-9999", deliveryMethod: "retirada" },
    });
    const saved = buildMercadoPagoPreferenceContext({
      orderId,
      itens: [],
      endereco: { nome: "Maria Silva", telefone: "5581999999999", deliveryMethod: "retirada" },
    });

    expect(national.payer?.phone).toEqual({ area_code: "81", number: "999999999" });
    expect(saved.payer?.phone).toEqual(national.payer?.phone);
    expect(national.payer?.address).toBeUndefined();
  });

  it("omits an invalid delivery address instead of inventing a street number", () => {
    const context = buildMercadoPagoPreferenceContext({
      orderId,
      itens: [],
      endereco: {
        nome: "Maria Silva",
        telefone: "(81) 99999-9999",
        deliveryMethod: "entrega",
        rua: "Rua das Flores",
        numero: "s/n",
        cep: "55.000-000",
      },
    });

    expect(context.payer?.address).toBeUndefined();
  });

  it("includes only a validated delivery address and bounds text", () => {
    const context = buildMercadoPagoPreferenceContext({
      orderId,
      itens: [{ nome: "<b>Santa Cruz</b>", tipo: "Torcedor", tamanho: "M", nomePersonalizado: "Ana" }],
      endereco: {
        nome: "Maria Silva",
        telefone: "(81) 99999-9999",
        deliveryMethod: "entrega",
        rua: "Rua das Flores",
        numero: "42",
        cep: "55000-000",
      },
    });

    expect(context.payer).toMatchObject({
      name: "Maria",
      surname: "Silva",
      address: { zip_code: "55000000", street_name: "Rua das Flores", street_number: "42" },
    });
    expect(context.item.title).toBe("RM Imports — Camisa Santa Cruz");
    expect(context.item.title.length).toBeLessThanOrEqual(120);
    expect(context.item.description.length).toBeLessThanOrEqual(500);
  });
});

describe("normalizeMPDeviceId", () => {
  it("accepts a valid Mercado Pago device ID", () => {
    expect(normalizeMPDeviceId("abc-123._:x")).toBe("abc-123._:x");
  });

  it.each([undefined, null, "", "abc\n123", {}, "a".repeat(257)])("omits invalid device IDs", (value) => {
    expect(normalizeMPDeviceId(value)).toBeUndefined();
  });
});

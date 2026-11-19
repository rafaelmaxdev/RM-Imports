import { describe, expect, it } from "vitest";
import type { Order } from "../types";
import { montarMensagemCliente } from "../lib/customerNotification";

const order: Order = {
  id: "UL-KZX9AL76", data: "2026-11-19", hora: "12:00", itens: [], total: 199.90,
  status: "a_caminho",
  endereco: {
    nome: "  Rafael Silva  ", rua: "Rua Privada", numero: "123", complemento: "",
    bairro: "Centro", cidade: "Recife", estado: "PE", cep: "50000-000",
    telefone: "81999999999", deliveryMethod: "entrega",
  },
};

describe("customer notifications", () => {
  it("explains transit to the store and shares only the tracking ID", () => {
    const message = montarMensagemCliente(order);
    expect(message).toContain("Olá, Rafael!");
    expect(message).toContain("está a caminho da nossa loja!");
    expect(message).toContain("próxima etapa da entrega");
    const link = new URL(message.match(/https:\/\/\S+/)![0]);
    expect(link.pathname).toBe("/meu-pedido");
    expect([...link.searchParams.entries()]).toEqual([["pedido", order.id]]);
    expect(message).not.toMatch(/Silva|Rua Privada|81999999999|199,90/);
  });

  it("announces pickup only when it is ready, rather than upon arrival at the store", () => {
    const pickup = { ...order, endereco: { ...order.endereco!, deliveryMethod: "retirada" as const } };
    expect(montarMensagemCliente({ ...pickup, status: "em_estoque" })).toContain("Avisaremos quando estiver disponível para retirada.");
    expect(montarMensagemCliente({ ...pickup, status: "em_entrega" })).toContain("está disponível para retirada!");
    expect(montarMensagemCliente({ ...order, status: "em_entrega" })).toContain("saiu para entrega!");
    expect(montarMensagemCliente(pickup)).toContain("próxima etapa da retirada");
  });

  it("covers every status and handles a missing customer name", () => {
    const statuses: Order["status"][] = ["pendente", "pago", "enviado_fornecedor", "em_producao", "a_caminho", "em_estoque", "em_entrega", "entregue", "cancelado", "reembolsado"];
    for (const status of statuses) {
      const message = montarMensagemCliente({ ...order, status, endereco: undefined });
      expect(message).toContain("Olá! Aqui é da *RM Imports*");
      expect(message).not.toContain("undefined");
    }
  });
});

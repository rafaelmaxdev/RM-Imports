import { describe, expect, it } from "vitest";
import { getPackageStatusAfterOrderAdvance } from "../lib/packageProgress";

const pacote = (status = "pago", pedido_ids = ["pedido-1", "pedido-2"]) => ({ status, pedido_ids });
const order = (id: string, status: string) => ({ id, status });

describe("getPackageStatusAfterOrderAdvance", () => {
  it("does not advance the package for the first paid order", () => {
    expect(
      getPackageStatusAfterOrderAdvance(
        pacote(),
        [order("pedido-1", "pago"), order("pedido-2", "pago")],
        "pedido-1",
        "enviado_fornecedor",
      ),
    ).toBeNull();
  });

  it("advances the package after the last paid order", () => {
    expect(
      getPackageStatusAfterOrderAdvance(
        pacote(),
        [order("pedido-1", "enviado_fornecedor"), order("pedido-2", "pago")],
        "pedido-2",
        "enviado_fornecedor",
      ),
    ).toBe("enviado_fornecedor");
  });

  it("accepts an order that is already further in the pipeline", () => {
    expect(
      getPackageStatusAfterOrderAdvance(
        pacote(),
        [order("pedido-1", "pago"), order("pedido-2", "em_producao")],
        "pedido-1",
        "enviado_fornecedor",
      ),
    ).toBe("enviado_fornecedor");
  });

  it("does not treat a pending order as advanced", () => {
    expect(
      getPackageStatusAfterOrderAdvance(
        pacote(),
        [order("pedido-1", "pago"), order("pedido-2", "pendente")],
        "pedido-1",
        "enviado_fornecedor",
      ),
    ).toBeNull();
  });

  it("does not advance when a package id is missing", () => {
    expect(
      getPackageStatusAfterOrderAdvance(
        pacote(),
        [order("pedido-1", "pago")],
        "pedido-1",
        "enviado_fornecedor",
      ),
    ).toBeNull();
  });

  it("does not advance a package without ids", () => {
    expect(
      getPackageStatusAfterOrderAdvance(
        pacote("pago", []),
        [],
        "pedido-1",
        "enviado_fornecedor",
      ),
    ).toBeNull();
  });

  it("does not accept an order outside the package", () => {
    expect(
      getPackageStatusAfterOrderAdvance(
        pacote(),
        [order("pedido-1", "pago"), order("pedido-2", "pago")],
        "pedido-desconhecido",
        "enviado_fornecedor",
      ),
    ).toBeNull();
  });

  it("does not treat a canceled order as advanced", () => {
    expect(
      getPackageStatusAfterOrderAdvance(
        pacote(),
        [order("pedido-1", "pago"), order("pedido-2", "cancelado")],
        "pedido-1",
        "enviado_fornecedor",
      ),
    ).toBeNull();
  });

  it("does not advance for a status outside the package pipeline", () => {
    expect(
      getPackageStatusAfterOrderAdvance(
        pacote("enviado_fornecedor"),
        [order("pedido-1", "enviado_fornecedor"), order("pedido-2", "enviado_fornecedor")],
        "pedido-1",
        "pago",
      ),
    ).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  return { from, supabase: { from } };
});

vi.mock("../lib/supabase", () => ({ supabase: mocks.supabase }));

const {
  FINANCE_EXTRAS_GENERIC_ERROR,
  createFinanceExtra,
  deleteFinanceExtra,
  getFinanceExtras,
  getUnsyncedExtras,
  importFinanceExtras,
  updateFinanceExtra,
} = await import("../lib/financeExtras");
import type { ExtraCusto } from "../lib/financeExtras";

const extra = (overrides: Partial<ExtraCusto> = {}): ExtraCusto => ({
  id: 101,
  nome: "Embalagem",
  quantidade: 2,
  preco: 10,
  data: "2026-10-14",
  cor: "#F4A261",
  ...overrides,
});

beforeEach(() => mocks.from.mockReset());

describe("finance extras helpers", () => {
  it("accepts an empty remote table instead of using a local fallback", async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    mocks.from.mockReturnValue({ select });

    await expect(getFinanceExtras()).resolves.toEqual([]);
    expect(select).toHaveBeenCalledWith("id,nome,quantidade,preco,data,cor");
  });

  it("turns response errors and malformed rows into the fixed error", async () => {
    const select = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "database secret" } })
      .mockResolvedValueOnce({ data: [{ id: 1, nome: "", quantidade: 1, preco: 1, data: "2026-10-14", cor: "#F4A261" }], error: null });
    mocks.from.mockReturnValue({ select });

    await expect(getFinanceExtras()).rejects.toThrow(FINANCE_EXTRAS_GENERIC_ERROR);
    await expect(getFinanceExtras()).rejects.toThrow(FINANCE_EXTRAS_GENERIC_ERROR);
  });

  it.each([
    ["date", { data: "2026-02-30" }],
    ["title", { nome: "x".repeat(201) }],
    ["quantity", { quantidade: 0 }],
    ["unsafe total", { quantidade: Number.MAX_SAFE_INTEGER, preco: 100 }],
  ])("rejects invalid %s before touching the SDK", async (_label, changes) => {
    await expect(createFinanceExtra(extra(changes))).rejects.toThrow(FINANCE_EXTRAS_GENERIC_ERROR);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("keeps a legacy zero-quantity row valid when reading", async () => {
    const select = vi.fn().mockResolvedValue({ data: [extra({ quantidade: 0 })], error: null });
    mocks.from.mockReturnValue({ select });

    await expect(getFinanceExtras()).resolves.toEqual([extra({ quantidade: 0 })]);
  });

  it("creates with insert and returns the selected server row", async () => {
    const serverExtra = extra({ nome: "Confirmado" });
    const single = vi.fn().mockResolvedValue({ data: serverExtra, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const upsert = vi.fn();
    mocks.from.mockReturnValue({ insert, upsert });

    await expect(createFinanceExtra(extra())).resolves.toEqual(serverExtra);
    expect(insert).toHaveBeenCalledOnce();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("updates the same id without deleting it", async () => {
    const changed = extra({ nome: "Atualizado" });
    const single = vi.fn().mockResolvedValue({ data: changed, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const remove = vi.fn();
    mocks.from.mockReturnValue({ update, delete: remove });

    await expect(updateFinanceExtra(changed)).resolves.toEqual(changed);
    expect(update).toHaveBeenCalledWith({ nome: "Atualizado", quantidade: 2, preco: 10, data: "2026-10-14", cor: "#F4A261" });
    expect(eq).toHaveBeenCalledWith("id", changed.id);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    [{ data: [], error: null }],
    [{ data: null, error: { message: "not authorized" } }],
  ])("fails delete when the server does not confirm a row", async (result) => {
    const select = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ select });
    const remove = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ delete: remove });

    await expect(deleteFinanceExtra(101)).rejects.toThrow(FINANCE_EXTRAS_GENERIC_ERROR);
    expect(select).toHaveBeenCalledWith("id");
  });

  it("imports atomically with insert and never upserts", async () => {
    const values = [extra(), extra({ id: 102, nome: "Etiqueta" })];
    const select = vi.fn().mockResolvedValue({ data: values, error: null });
    const insert = vi.fn().mockReturnValue({ select });
    const upsert = vi.fn();
    mocks.from.mockReturnValue({ insert, upsert });

    await expect(importFinanceExtras(values)).resolves.toEqual(values);
    expect(insert).toHaveBeenCalledOnce();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("finds pending ids without mutating either input", () => {
    const remote = [extra({ id: 101 })];
    const cached = [extra({ id: 101 }), extra({ id: 102 })];

    expect(getUnsyncedExtras(remote, cached)).toEqual([cached[1]]);
    expect(remote).toEqual([extra({ id: 101 })]);
    expect(cached).toEqual([extra({ id: 101 }), extra({ id: 102 })]);
  });
});

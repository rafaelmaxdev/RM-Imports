import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const rpc = vi.fn();
  const supabase = { auth: { getUser: authGetUser }, rpc };
  return {
    authGetUser,
    createClient: vi.fn(() => supabase),
    consumeRateLimit: vi.fn(),
    fetch: vi.fn(),
    rpc,
    setCorsHeaders: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("../../server/lib/cors.js", () => ({ setCorsHeaders: mocks.setCorsHeaders }));
vi.mock("../../server/lib/security.js", async () => {
  const actual = await vi.importActual<typeof import("../../server/lib/security.js")>("../../server/lib/security.js");
  return { ...actual, consumeRateLimit: mocks.consumeRateLimit };
});

vi.stubGlobal("fetch", mocks.fetch);
vi.stubEnv("VITE_SUPABASE_URL", "https://unit-test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
vi.stubEnv("MP_ACCESS_TOKEN", "test-mp-token");

const { default: handler } = await import("../../api/owner-finance.ts");

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const WITHDRAWAL_ID = "33333333-3333-4333-8333-333333333333";
const FINGERPRINT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const orderId = "order-stock-pix";

type Row = Record<string, unknown>;

function sources(overrides: Row = {}): Row {
  return {
    orders: [{
      id: orderId,
      status: "entregue",
      total: 10,
      itens: [{ productId: "product-1", tamanho: "M", personalizado: false, feminino: false, nomePersonalizado: null, numeroPersonalizado: null }],
      admin_order: false,
      reposicao: false,
      pronta_entrega: true,
      payment_method: "pix",
      mp_payment_id: null,
      comissao_calculada: null,
      rev_share_percentual: null,
    }],
    packages: [],
    stock: [{
      produto_id: "product-1",
      tamanho: "M",
      custo: 7,
      personalizado: false,
      feminino: false,
      nome_personalizado: null,
      numero_personalizado: null,
    }],
    products: [],
    config: [],
    extras: [],
    ...overrides,
  };
}

function snapshot(overrides: Row = {}): Row {
  return {
    sources: sources(),
    fingerprint: FINGERPRINT,
    withdrawals: [],
    ...overrides,
  };
}

function withdrawal(overrides: Row = {}): Row {
  return {
    id: WITHDRAWAL_ID,
    owner: "rafael",
    amount_cents: 10,
    withdrawal_date: "2026-10-12",
    note: "",
    profit_basis_cents: 300,
    recorded_by: ADMIN_ID,
    voided_at: null,
    ...overrides,
  };
}

function recordBody(overrides: Row = {}): Row {
  return {
    action: "record",
    id: WITHDRAWAL_ID,
    owner: "rafael",
    amountCents: 90,
    withdrawalDate: "2020-01-02",
    note: " retirada ",
    ...overrides,
  };
}

function request(method: string, body?: unknown, token = "admin-token"): VercelRequest {
  return {
    method,
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as VercelRequest;
}

function response() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>(), ended: false };
  const res = {
    status(code: number) {
      result.statusCode = code;
      return res;
    },
    json(body: unknown) {
      result.body = body;
      return res;
    },
    end() {
      result.ended = true;
      return res;
    },
    setHeader(name: string, value: string) {
      result.headers.set(name, value);
    },
  } as unknown as VercelResponse;
  return { res, result };
}

async function invoke(method = "GET", body?: unknown, token = "admin-token") {
  const current = response();
  await handler(request(method, body, token), current.res);
  return current.result;
}

function payment(overrides: Row = {}): Row {
  return {
    id: "123456789",
    status: "approved",
    external_reference: orderId,
    currency_id: "BRL",
    transaction_amount: 10,
    transaction_details: { net_received_amount: 10 },
    ...overrides,
  };
}

function setPaymentSource(paymentId = "123456789") {
  const current = sources();
  const order = current.orders as Row[];
  order[0] = { ...order[0], mp_payment_id: paymentId, payment_method: "credit_card" };
  return current;
}

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://unit-test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  vi.stubEnv("MP_ACCESS_TOKEN", "test-mp-token");
  mocks.createClient.mockClear();
  mocks.authGetUser.mockReset().mockResolvedValue({
    data: { user: { id: ADMIN_ID, app_metadata: { role: "admin" } } },
    error: null,
  });
  mocks.consumeRateLimit.mockReset().mockResolvedValue(true);
  mocks.fetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => payment() });
  mocks.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === "get_owner_finance_snapshot") return { data: snapshot(), error: null };
    if (name === "record_owner_withdrawal") return { data: withdrawal(), error: null };
    if (name === "void_owner_withdrawal") return { data: withdrawal({ voided_at: "2026-10-13T12:00:00Z", void_reason: "correção" }), error: null };
    return { data: null, error: null };
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("owner finance API security and protocol", () => {
  it("rejects a missing bearer token without financial RPC", async () => {
    const result = await invoke("GET", undefined, "");
    expect(result.statusCode).toBe(401);
    expect(mocks.authGetUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-admin before the snapshot", async () => {
    mocks.authGetUser.mockResolvedValueOnce({
      data: { user: { id: OTHER_ID, app_metadata: { role: "user" } } },
      error: null,
    });
    const result = await invoke();
    expect(result.statusCode).toBe(403);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an authenticated user without a valid UUID", async () => {
    mocks.authGetUser.mockResolvedValueOnce({
      data: { user: { id: "synthetic-admin", app_metadata: { role: "admin" } } },
      error: null,
    });
    const result = await invoke();
    expect(result.statusCode).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("handles OPTIONS and unexpected methods without authentication", async () => {
    const options = await invoke("OPTIONS", { action: "record" }, "");
    expect(options.statusCode).toBe(204);
    expect(options.ended).toBe(true);

    const method = await invoke("PUT", { action: "record" }, "");
    expect(method.statusCode).toBe(405);
    expect(mocks.authGetUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a safe 503 when Supabase environment is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const result = await invoke("GET", undefined, "");
    expect(result.statusCode).toBe(503);
    expect(result.body).toEqual({ error: "Serviço indisponível." });
    expect(mocks.authGetUser).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong body", null],
    ["missing action", {}],
    ["unknown action", { action: "delete" }],
  ])("rejects %s without a financial RPC", async (_label, body) => {
    const result = await invoke("POST", body);
    expect(result.statusCode).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reads a coherent snapshot and exposes only computed finance data", async () => {
    const result = await invoke();
    const body = result.body as Row;
    expect(result.statusCode).toBe(200);
    expect(body.summary).toMatchObject({ profitCents: 300, revenueCents: 1000, productCostCents: 700 });
    expect(body.balances).toMatchObject({ owners: { rafael: { entitlementCents: 90, balanceCents: 90 } } });
    expect(body.withdrawals).toEqual([]);
    expect(body).not.toHaveProperty("sources");
    expect(body).not.toHaveProperty("fingerprint");
    expect(mocks.rpc).toHaveBeenCalledWith("get_owner_finance_snapshot");
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(expect.anything(), "owner-finance", ADMIN_ID, 60, 60);
  });

  it("sets no-store and uses the CORS helper", async () => {
    const result = await invoke();
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.setCorsHeaders).toHaveBeenCalledWith(expect.anything(), expect.anything(), "GET, POST, OPTIONS");
  });

  it("creates a stateless server Supabase client", async () => {
    await invoke();
    expect(mocks.createClient).toHaveBeenCalledWith("https://unit-test.supabase.co", "test-service-role", {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  });

  it.each([
    ["float", { amountCents: 1.5 }],
    ["negative", { amountCents: -1 }],
    ["zero", { amountCents: 0 }],
    ["future date", { withdrawalDate: "2999-01-01" }],
    ["invalid date", { withdrawalDate: "2026-02-30" }],
    ["invalid year zero", { withdrawalDate: "0000-01-01" }],
    ["invalid owner", { owner: "other" }],
    ["invalid UUID", { id: "not-a-uuid" }],
    ["long note", { note: "x".repeat(301) }],
  ])("rejects a record %s before loading finance", async (_label, overrides) => {
    const result = await invoke("POST", recordBody(overrides));
    expect(result.statusCode).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("owner finance accounting", () => {
  it("ignores a forged client profit and sends the fresh computed profit and fingerprint", async () => {
    const result = await invoke("POST", recordBody({ profitCents: 999999999, p_profit_cents: -1 }));
    expect(result.statusCode).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "get_owner_finance_snapshot");
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "record_owner_withdrawal", {
      p_id: WITHDRAWAL_ID,
      p_owner: "rafael",
      p_amount_cents: 90,
      p_withdrawal_date: "2020-01-02",
      p_note: "retirada",
      p_profit_cents: 300,
      p_fingerprint: FINGERPRINT,
      p_actor: ADMIN_ID,
    });
  });

  it("lets the RPC own idempotent replay instead of pre-checking balance", async () => {
    const first = await invoke("POST", recordBody());
    const second = await invoke("POST", recordBody());
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect((first.body as Row).withdrawal).toEqual((second.body as Row).withdrawal);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "record_owner_withdrawal")).toHaveLength(2);
  });

  it("maps insufficient balance to 400 without another JS balance check", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_owner_finance_snapshot") return { data: snapshot(), error: null };
      if (name === "record_owner_withdrawal") return { data: null, error: { code: "22023", message: "Saldo insuficiente para registrar este saque." } };
      return { data: null, error: null };
    });
    const result = await invoke("POST", recordBody({ amountCents: 91 }));
    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({ error: "Saldo insuficiente para registrar este saque." });
  });

  it("maps a stale fingerprint to 409", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_owner_finance_snapshot") return { data: snapshot(), error: null };
      if (name === "record_owner_withdrawal") return { data: null, error: { code: "40001", message: "database detail" } };
      return { data: null, error: null };
    });
    const result = await invoke("POST", recordBody());
    expect(result.statusCode).toBe(409);
    expect(result.body).toEqual({ error: "Os dados financeiros mudaram. Atualize os saldos e tente novamente." });
  });

  it("maps a missing migration without exposing SQL", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "private SQL text" } });
    const result = await invoke();
    expect(result.statusCode).toBe(503);
    expect(result.body).toEqual({ error: "Execute add_owner_profit_accounts.sql no Supabase." });
    expect(JSON.stringify(result.body)).not.toContain("private SQL text");
  });

  it("voids only the ledger row with the verified actor and reason", async () => {
    const result = await invoke("POST", { action: "void", id: WITHDRAWAL_ID, reason: " correção " });
    expect(result.statusCode).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("void_owner_withdrawal", {
      p_id: WITHDRAWAL_ID,
      p_reason: "correção",
      p_actor: ADMIN_ID,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("get_owner_finance_snapshot");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect((result.body as Row).withdrawal).toHaveProperty("void_reason", "correção");
  });

  it("does not leak source payloads or notes through logs", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: snapshot({ sources: sources({ orders: [{ id: orderId, status: "unknown", secret: "source-private" }] }), withdrawals: [withdrawal({ note: "buyer private note" })] }),
      error: null,
    });
    const result = await invoke();
    expect(result.statusCode).toBe(200);
    expect(JSON.stringify(result.body)).not.toContain("source-private");
    expect(vi.mocked(console.error).mock.calls).toEqual([]);
    expect(vi.mocked(console.warn).mock.calls).toEqual([]);
    expect(vi.mocked(console.log).mock.calls).toEqual([]);
  });
});

describe("Mercado Pago fee verification", () => {
  beforeEach(() => {
    const paymentSource = setPaymentSource();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_owner_finance_snapshot") return { data: snapshot({ sources: paymentSource }), error: null };
      if (name === "record_owner_withdrawal") return { data: withdrawal(), error: null };
      return { data: null, error: null };
    });
  });

  it("uses the approved payment net amount and exact order reference", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payment({ transaction_details: { net_received_amount: 9.5 } }) });
    const result = await invoke();
    expect(result.statusCode).toBe(200);
    expect((result.body as Row).summary).toMatchObject({ mpFeeCents: 50, profitCents: 250, eligibleOrderCount: 1 });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.mercadopago.com/v1/payments/123456789",
      expect.objectContaining({ method: "GET", headers: { Authorization: "Bearer test-mp-token" }, signal: expect.anything() }),
    );
  });

  it.each([
    ["different id", { id: "987654321" }],
    ["missing id", { id: undefined }],
  ])("fails closed when Mercado Pago returns a %s", async (_label, overrides) => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payment(overrides) });
    const result = await invoke();
    expect(result.statusCode).toBe(503);
    expect((result.body as Row).error).toContain("confirmar as taxas");
  });

  it.each([
    ["non-approved", { status: "pending" }],
    ["reference mismatch", { external_reference: "other-order" }],
    ["amount mismatch", { transaction_amount: 9 }],
    ["currency mismatch", { currency_id: "USD" }],
    ["partial refund", { transaction_amount_refunded: 1 }],
  ])("holds a payment for %s instead of estimating a fee", async (_label, overrides) => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payment(overrides) });
    const result = await invoke();
    expect(result.statusCode).toBe(200);
    expect((result.body as Row).summary).toMatchObject({ awaitingFeeCount: 1, eligibleOrderCount: 0, mpFeeCents: 0 });
  });

  it("uses collector and legacy fee details, with zero excluded payer fees", async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payment({
        transaction_details: {},
        fee_details: [
          { fee_payer: "collector", amount: 0.4 },
          { amount: 0.1 },
          { fee_payer: "payer", amount: 99 },
        ],
      }),
    });
    const result = await invoke();
    expect(result.statusCode).toBe(200);
    expect((result.body as Row).summary).toMatchObject({ mpFeeCents: 50, profitCents: 250 });
  });

  it("holds an approved payment when both fee sources are unknown", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payment({ transaction_details: {} }) });
    const result = await invoke();
    expect(result.statusCode).toBe(200);
    expect((result.body as Row).summary).toMatchObject({ awaitingFeeCount: 1, eligibleOrderCount: 0 });
  });

  it("fails closed for an unknown fee payer and never records", async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payment({ transaction_details: {}, fee_details: [{ fee_payer: "other", amount: 0.5 }] }),
    });
    const result = await invoke("POST", recordBody());
    expect(result.statusCode).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalledWith("record_owner_withdrawal", expect.anything());
  });

  it("fails closed on a Mercado Pago outage and never records", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ secret: "raw" }) });
    const result = await invoke("POST", recordBody());
    expect(result.statusCode).toBe(503);
    expect(result.body).toEqual({ error: "Não foi possível confirmar as taxas dos pagamentos. Confira a configuração do Mercado Pago." });
    expect(mocks.rpc).not.toHaveBeenCalledWith("record_owner_withdrawal", expect.anything());
  });

  it("fails closed when the Mercado Pago token is missing", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    const result = await invoke();
    expect(result.statusCode).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not call Mercado Pago for a delivered external Pix order", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_owner_finance_snapshot") return { data: snapshot({ sources: sources() }), error: null };
      return { data: null, error: null };
    });
    const result = await invoke();
    expect(result.statusCode).toBe(200);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect((result.body as Row).summary).toMatchObject({ profitCents: 300, mpFeeCents: 0 });
  });
});

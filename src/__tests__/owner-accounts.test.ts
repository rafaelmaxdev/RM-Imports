import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getSession = vi.fn();
  const fetch = vi.fn();
  return {
    fetch,
    getSession,
    supabase: { auth: { getSession } },
  };
});

vi.mock("../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.stubGlobal("fetch", mocks.fetch);

const {
  getOwnerAccounts,
  parseBRLToCents,
  recordOwnerWithdrawal,
  voidOwnerWithdrawal,
} = await import("../lib/ownerAccounts");

const withdrawal = {
  id: "33333333-3333-4333-8333-333333333333",
  owner: "rafael",
  amount_cents: 1234,
  withdrawal_date: "2026-10-12",
  note: "retirada",
  profit_basis_cents: 10000,
  recorded_at: "2026-10-12T12:00:00.000Z",
  recorded_by: "11111111-1111-4111-8111-111111111111",
  voided_at: null,
  voided_by: null,
  void_reason: null,
};

function validResponse() {
  return {
    summary: {
      profitCents: 10000,
      revenueCents: 20000,
      productCostCents: 5000,
      shippingCostCents: 1000,
      importCostCents: 500,
      mpFeeCents: 500,
      commissionCents: 0,
      extraCostCents: 3000,
      eligibleOrderCount: 1,
      awaitingCostCount: 0,
      awaitingFeeCount: 0,
      pendingOrderCount: 0,
      pendingRevenueCents: 0,
    },
    balances: {
      retainedStoreCents: 4000,
      owners: {
        rafael: { entitlementCents: 3000, withdrawnCents: 0, balanceCents: 3000 },
        renan: { entitlementCents: 3000, withdrawnCents: 0, balanceCents: 3000 },
      },
    },
    withdrawals: [withdrawal],
  };
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.getSession.mockReset().mockResolvedValue({
    data: { session: { access_token: "fake-token" } },
    error: null,
  });
});

describe("owner accounts helper", () => {
  it("does not fetch without an authenticated session", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    await expect(getOwnerAccounts()).rejects.toThrow("Faça login como administrador.");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("uses the session bearer token and no-store GET", async () => {
    mocks.fetch.mockResolvedValueOnce(response(validResponse()));

    await expect(getOwnerAccounts()).resolves.toEqual(validResponse());
    expect(mocks.fetch).toHaveBeenCalledWith("/api/owner-finance", {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: "Bearer fake-token" },
    });
    expect(JSON.stringify(mocks.fetch.mock.calls[0])).not.toContain("service_role");
    expect(JSON.stringify(mocks.fetch.mock.calls[0])).not.toContain("fake-token/");
  });

  it("sends record values in cents with the supplied id", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ withdrawal }));

    await recordOwnerWithdrawal({
      id: withdrawal.id,
      owner: "rafael",
      amountCents: 1234,
      withdrawalDate: "2026-10-12",
      note: " retirada ",
    });

    expect(mocks.fetch).toHaveBeenCalledWith("/api/owner-finance", {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: "Bearer fake-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "record",
        id: withdrawal.id,
        owner: "rafael",
        amountCents: 1234,
        withdrawalDate: "2026-10-12",
        note: "retirada",
      }),
    });
  });

  it("trims the void reason and sends no token in the URL", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ withdrawal: { ...withdrawal, voided_at: "2026-10-13T12:00:00.000Z", voided_by: withdrawal.recorded_by, void_reason: "correção" } }));

    await voidOwnerWithdrawal({ id: withdrawal.id, reason: " correção " });

    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/owner-finance");
    expect(init.body).toBe(JSON.stringify({ action: "void", id: withdrawal.id, reason: "correção" }));
    expect(url).not.toContain("fake-token");
  });

  it("propagates only a safe API error", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ error: "Saldo insuficiente para registrar este saque." }, 400));

    await expect(getOwnerAccounts()).rejects.toThrow("Saldo insuficiente para registrar este saque.");
  });

  it("rejects malformed responses instead of fabricating zeros", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ summary: {} }));

    await expect(getOwnerAccounts()).rejects.toThrow("Não foi possível processar a operação financeira.");
  });

  it("rejects unsafe financial integers", async () => {
    const invalid = validResponse();
    invalid.summary.profitCents = Number.MAX_SAFE_INTEGER + 1;
    mocks.fetch.mockResolvedValueOnce(response(invalid));

    await expect(getOwnerAccounts()).rejects.toThrow("Não foi possível processar a operação financeira.");
  });

  it.each([
    ["retained store", (data: ReturnType<typeof validResponse>) => { data.balances.retainedStoreCents = -1; }],
    ["owner earnings", (data: ReturnType<typeof validResponse>) => { data.balances.owners.rafael.entitlementCents = -1; }],
    ["owner withdrawals", (data: ReturnType<typeof validResponse>) => { data.balances.owners.rafael.withdrawnCents = -1; }],
  ])("rejects negative %s", async (_label, mutate) => {
    const invalid = validResponse();
    mutate(invalid);
    mocks.fetch.mockResolvedValueOnce(response(invalid));

    await expect(getOwnerAccounts()).rejects.toThrow("Não foi possível processar a operação financeira.");
  });

  it("keeps negative realized profit and owner balance valid", async () => {
    const negative = validResponse();
    negative.summary.profitCents = -1;
    negative.balances.owners.rafael.balanceCents = -1;
    mocks.fetch.mockResolvedValueOnce(response(negative));

    await expect(getOwnerAccounts()).resolves.toMatchObject({
      summary: { profitCents: -1 },
      balances: { owners: { rafael: { balanceCents: -1 } } },
    });
  });
});

describe("parseBRLToCents", () => {
  it.each([
    ["1", 100],
    ["1,0", 100],
    ["1,00", 100],
    ["1.0", 100],
    ["1.00", 100],
    ["0,01", 1],
    ["10,5", 1050],
    ["10.50", 1050],
    ["00010,50", 1050],
    ["90071992547409,91", Number.MAX_SAFE_INTEGER],
  ])("converts %s without floating point", (raw, expected) => {
    expect(parseBRLToCents(raw)).toBe(expected);
  });

  it.each([
    "",
    "0",
    "0,00",
    "-1",
    "+1",
    "R$ 1,00",
    "1.234,56",
    "1,234.56",
    "1,000",
    "1.234",
    "1,234",
    "1,",
    ".50",
    ",50",
    "NaN",
    "Infinity",
    "90071992547409,92",
  ])("rejects invalid currency %s", (raw) => {
    expect(parseBRLToCents(raw)).toBeNull();
  });
});

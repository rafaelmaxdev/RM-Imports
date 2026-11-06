import { parseBRLToCents } from "../../server/lib/owner-finance";
import type {
  OwnerBalance,
  OwnerBalances,
  OwnerProfitSummary,
} from "../../server/lib/owner-finance";
import { supabase } from "./supabase";

export { parseBRLToCents };

export type Owner = "rafael" | "renan";

export interface OwnerWithdrawal {
  id: string;
  owner: Owner;
  amount_cents: number;
  withdrawal_date: string;
  note: string;
  profit_basis_cents: number;
  recorded_at: string;
  recorded_by: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface OwnerAccountsResponse {
  summary: OwnerProfitSummary;
  balances: OwnerBalances;
  withdrawals: OwnerWithdrawal[];
}

export interface RecordOwnerWithdrawalInput {
  id: string;
  owner: Owner;
  amountCents: number;
  withdrawalDate: string;
  note?: string;
}

export interface VoidOwnerWithdrawalInput {
  id: string;
  reason: string;
}

export const OWNER_ACCOUNTS_NO_SESSION_ERROR = "Faça login como administrador.";
export const OWNER_ACCOUNTS_GENERIC_ERROR = "Não foi possível processar a operação financeira.";

const SUMMARY_KEYS = [
  "profitCents",
  "revenueCents",
  "productCostCents",
  "shippingCostCents",
  "importCostCents",
  "mpFeeCents",
  "commissionCents",
  "extraCostCents",
  "eligibleOrderCount",
  "awaitingCostCount",
  "awaitingFeeCount",
  "pendingOrderCount",
  "pendingRevenueCents",
] as const;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, allowNegative = true): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && (allowNegative || value >= 0);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseSummary(value: unknown): OwnerProfitSummary | null {
  if (!isObject(value)) return null;

  for (const key of SUMMARY_KEYS) {
    const allowNegative = key === "profitCents";
    if (!safeInteger(value[key], allowNegative)) return null;
  }

  const summary = value as unknown as OwnerProfitSummary;
  if (summary.eligibleOrderCount < 0
    || summary.awaitingCostCount < 0
    || summary.awaitingFeeCount < 0
    || summary.pendingOrderCount < 0) {
    return null;
  }
  return summary;
}

function parseOwnerBalance(value: unknown): OwnerBalance | null {
  if (!isObject(value)) return null;
  if (!safeInteger(value.entitlementCents, false)
    || !safeInteger(value.withdrawnCents, false)
    || !safeInteger(value.balanceCents)) {
    return null;
  }
  return value as unknown as OwnerBalance;
}

function parseBalances(value: unknown): OwnerBalances | null {
  if (!isObject(value)) return null;
  if (!safeInteger(value.retainedStoreCents, false)) return null;
  if (!isObject(value.owners)) return null;

  const rafael = parseOwnerBalance(value.owners.rafael);
  const renan = parseOwnerBalance(value.owners.renan);
  if (!rafael || !renan) return null;

  return {
    retainedStoreCents: value.retainedStoreCents,
    owners: { rafael, renan },
  };
}

function parseWithdrawal(value: unknown): OwnerWithdrawal | null {
  if (!isObject(value)
    || !nonEmptyString(value.id)
    || (value.owner !== "rafael" && value.owner !== "renan")
    || !safeInteger(value.amount_cents, false)
    || value.amount_cents <= 0
    || !nonEmptyString(value.withdrawal_date)
    || typeof value.note !== "string"
    || !safeInteger(value.profit_basis_cents)
    || !nonEmptyString(value.recorded_at)
    || !nonEmptyString(value.recorded_by)
    || !nullableString(value.voided_at)
    || !nullableString(value.voided_by)
    || !nullableString(value.void_reason)) {
    return null;
  }

  return {
    id: value.id,
    owner: value.owner,
    amount_cents: value.amount_cents,
    withdrawal_date: value.withdrawal_date,
    note: value.note,
    profit_basis_cents: value.profit_basis_cents,
    recorded_at: value.recorded_at,
    recorded_by: value.recorded_by,
    voided_at: value.voided_at,
    voided_by: value.voided_by,
    void_reason: value.void_reason,
  };
}

function parseWithdrawals(value: unknown): OwnerWithdrawal[] | null {
  if (!Array.isArray(value)) return null;
  const withdrawals: OwnerWithdrawal[] = [];
  for (const item of value) {
    const withdrawal = parseWithdrawal(item);
    if (!withdrawal) return null;
    withdrawals.push(withdrawal);
  }
  return withdrawals;
}

function parseAccounts(value: unknown): OwnerAccountsResponse | null {
  if (!isObject(value)) return null;
  const summary = parseSummary(value.summary);
  const balances = parseBalances(value.balances);
  const withdrawals = parseWithdrawals(value.withdrawals);
  if (!summary || !balances || !withdrawals) return null;
  return { summary, balances, withdrawals };
}

function parseWithdrawalResponse(value: unknown): OwnerWithdrawal | null {
  if (!isObject(value)) return null;
  return parseWithdrawal(value.withdrawal);
}

async function sessionToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (typeof token === "string" && token.trim()) return token;
  } catch {
    // Authentication failures are intentionally exposed as the same safe message.
  }
  throw new Error(OWNER_ACCOUNTS_NO_SESSION_ERROR);
}

async function request(path: string, method: "GET" | "POST", body?: JsonObject): Promise<JsonObject> {
  const token = await sessionToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const init: RequestInit = { method, cache: "no-store", headers };

  if (body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(OWNER_ACCOUNTS_GENERIC_ERROR);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(OWNER_ACCOUNTS_GENERIC_ERROR);
  }

  const successful = response.ok || (response.ok === undefined && response.status >= 200 && response.status < 300);
  if (!successful) {
    if (isObject(payload) && typeof payload.error === "string" && payload.error.trim()) {
      throw new Error(payload.error);
    }
    throw new Error(OWNER_ACCOUNTS_GENERIC_ERROR);
  }
  if (!isObject(payload)) throw new Error(OWNER_ACCOUNTS_GENERIC_ERROR);
  return payload;
}

export async function getOwnerAccounts(): Promise<OwnerAccountsResponse> {
  const payload = await request("/api/owner-finance", "GET");
  const accounts = parseAccounts(payload);
  if (!accounts) throw new Error(OWNER_ACCOUNTS_GENERIC_ERROR);
  return accounts;
}

export async function recordOwnerWithdrawal(input: RecordOwnerWithdrawalInput): Promise<OwnerWithdrawal> {
  const payload = await request("/api/owner-finance", "POST", {
    action: "record",
    id: input.id,
    owner: input.owner,
    amountCents: input.amountCents,
    withdrawalDate: input.withdrawalDate,
    note: typeof input.note === "string" ? input.note.trim() : "",
  });
  const withdrawal = parseWithdrawalResponse(payload);
  if (!withdrawal) throw new Error(OWNER_ACCOUNTS_GENERIC_ERROR);
  return withdrawal;
}

export async function voidOwnerWithdrawal(input: VoidOwnerWithdrawalInput): Promise<OwnerWithdrawal> {
  const payload = await request("/api/owner-finance", "POST", {
    action: "void",
    id: input.id,
    reason: input.reason.trim(),
  });
  const withdrawal = parseWithdrawalResponse(payload);
  if (!withdrawal) throw new Error(OWNER_ACCOUNTS_GENERIC_ERROR);
  return withdrawal;
}

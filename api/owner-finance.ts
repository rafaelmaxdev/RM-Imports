import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bearerToken, consumeRateLimit } from "../server/lib/security.js";
import { setCorsHeaders } from "../server/lib/cors.js";
import {
  calculateOwnerBalances,
  calculateOwnerProfit,
  getPaymentOrdersForVerification,
} from "../server/lib/owner-finance.js";

const SOURCE_KEYS = ["orders", "packages", "stock", "products", "config", "extras"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[a-f0-9]{32}$/;
const PAYMENT_ID_PATTERN = /^\d+$/;
const MP_FEE_ERROR = "Não foi possível confirmar as taxas dos pagamentos. Confira a configuração do Mercado Pago.";
const MIGRATION_ERROR = "Execute add_owner_profit_accounts.sql no Supabase.";
const STALE_ERROR = "Os dados financeiros mudaram. Atualize os saldos e tente novamente.";
const FORBIDDEN_ERROR = "Acesso administrativo necessário.";
const VALIDATION_ERROR = "Dados do saque inválidos.";
const GENERIC_ERROR = "Não foi possível processar a operação financeira.";
const SNAPSHOT_ERROR = "Não foi possível carregar os dados financeiros.";

type JsonObject = Record<string, unknown>;
type Supabase = SupabaseClient;

interface FinanceSnapshot {
  sources: JsonObject;
  fingerprint: string;
  withdrawals: unknown[];
}

interface Failure {
  status: number;
  message: string;
}

type SnapshotResult =
  | { ok: true; snapshot: FinanceSnapshot }
  | { ok: false; failure: Failure };

type FeesResult =
  | { ok: true; fees: Map<string, number> }
  | { ok: false; failure: Failure };

type PaymentResult =
  | { kind: "fee"; cents: number }
  | { kind: "hold" }
  | { kind: "unavailable" };

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function responseError(res: VercelResponse, failure: Failure): VercelResponse {
  return res.status(failure.status).json({ error: failure.message });
}

function initSupabase(): Supabase | null {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  try {
    return createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  } catch {
    return null;
  }
}

function errorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function errorMessage(error: unknown): string {
  return isRecord(error) && typeof error.message === "string" ? error.message : "";
}

function mapRpcError(error: unknown): Failure {
  const code = errorCode(error);
  const message = errorMessage(error);

  if (code === "PGRST202" || code === "42883") {
    return { status: 503, message: MIGRATION_ERROR };
  }
  if (code === "40001") {
    return { status: 409, message: STALE_ERROR };
  }
  if (code === "42501") {
    return { status: 403, message: FORBIDDEN_ERROR };
  }
  if (code === "22023") {
    if (/saldo insuficiente/i.test(message)) {
      return { status: 400, message: "Saldo insuficiente para registrar este saque." };
    }
    if (/identificador.*outro registro/i.test(message)) {
      return { status: 400, message: "Este identificador já pertence a outro registro." };
    }
    if (/motivo da anulação/i.test(message)) {
      return { status: 400, message: "Informe o motivo da anulação." };
    }
    if (/registro de saque não encontrado/i.test(message)) {
      return { status: 400, message: "Registro de saque não encontrado." };
    }
    if (/dados (?:do saque|financeiros) inválidos/i.test(message)) {
      return { status: 400, message: VALIDATION_ERROR };
    }
    return { status: 400, message: GENERIC_ERROR };
  }
  return { status: 500, message: GENERIC_ERROR };
}

function parseSnapshot(value: unknown): FinanceSnapshot | null {
  if (!isRecord(value) || !isRecord(value.sources) || !Array.isArray(value.withdrawals)) return null;

  const fingerprint = typeof value.fingerprint === "string" ? value.fingerprint : null;
  if (!fingerprint || !FINGERPRINT_PATTERN.test(fingerprint)) return null;

  const sources = value.sources;
  if (!SOURCE_KEYS.every((key) => Array.isArray(sources[key]))) return null;
  return {
    sources,
    fingerprint,
    withdrawals: value.withdrawals,
  };
}

async function loadSnapshot(supabase: Supabase): Promise<SnapshotResult> {
  try {
    const { data, error } = await supabase.rpc("get_owner_finance_snapshot");
    if (error) return { ok: false, failure: mapRpcError(error) };
    const snapshot = parseSnapshot(data);
    return snapshot
      ? { ok: true, snapshot }
      : { ok: false, failure: { status: 500, message: SNAPSHOT_ERROR } };
  } catch {
    return { ok: false, failure: { status: 500, message: SNAPSHOT_ERROR } };
  }
}

function centsFromMoney(value: unknown): number | null {
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;
  if (!Number.isFinite(number) || number < 0) return null;
  const cents = Math.round(number * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(number - cents / 100) > 1e-8) return null;
  return cents;
}

function addCents(left: number, right: number): number | null {
  const result = left + right;
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

function expectedOrderTotal(sources: JsonObject, orderId: string): number | null {
  const orders = sources.orders;
  if (!Array.isArray(orders)) return null;
  const row = orders.find((candidate) => isRecord(candidate) && candidate.id === orderId);
  return isRecord(row) ? centsFromMoney(row.total) : null;
}

function feeFromDetails(payment: JsonObject, amountCents: number): PaymentResult {
  const transactionDetails = payment.transaction_details;
  if (transactionDetails !== undefined && transactionDetails !== null && !isRecord(transactionDetails)) {
    return { kind: "unavailable" };
  }

  const netReceived = isRecord(transactionDetails) ? transactionDetails.net_received_amount : undefined;
  if (netReceived !== undefined && netReceived !== null) {
    const netCents = centsFromMoney(netReceived);
    if (netCents === null || netCents > amountCents) return { kind: "unavailable" };
    const feeCents = amountCents - netCents;
    return Number.isSafeInteger(feeCents) && feeCents >= 0
      ? { kind: "fee", cents: feeCents }
      : { kind: "unavailable" };
  }

  const details = payment.fee_details;
  if (details === undefined || details === null) return { kind: "hold" };
  if (!Array.isArray(details)) return { kind: "unavailable" };

  let total = 0;
  for (const rawDetail of details) {
    if (!isRecord(rawDetail)) return { kind: "unavailable" };
    const payer = rawDetail.fee_payer;
    if (payer !== undefined && payer !== "collector") {
      if (payer === "payer") continue;
      return { kind: "unavailable" };
    }
    const amount = centsFromMoney(rawDetail.amount);
    if (amount === null) return { kind: "unavailable" };
    const next = addCents(total, amount);
    if (next === null) return { kind: "unavailable" };
    total = next;
  }
  return { kind: "fee", cents: total };
}

function inspectPayment(payment: unknown, paymentId: string, orderId: string, expectedCents: number): PaymentResult {
  if (!isRecord(payment) || typeof payment.status !== "string") return { kind: "unavailable" };
  if (payment.id === undefined || String(payment.id) !== paymentId) return { kind: "unavailable" };
  if (payment.status !== "approved") return { kind: "hold" };
  if (typeof payment.external_reference !== "string" || typeof payment.currency_id !== "string") {
    return { kind: "unavailable" };
  }

  const amountCents = centsFromMoney(payment.transaction_amount);
  if (amountCents === null) return { kind: "unavailable" };
  if (payment.external_reference !== orderId || payment.currency_id !== "BRL" || amountCents !== expectedCents) {
    return { kind: "hold" };
  }

  if (payment.transaction_amount_refunded !== undefined && payment.transaction_amount_refunded !== null) {
    const refundedCents = centsFromMoney(payment.transaction_amount_refunded);
    if (refundedCents === null) return { kind: "unavailable" };
    if (refundedCents > 0) return { kind: "hold" };
  }

  return feeFromDetails(payment, amountCents);
}

async function fetchPayment(paymentId: string, orderId: string, expectedCents: number, token: string): Promise<PaymentResult> {
  if (!PAYMENT_ID_PATTERN.test(paymentId)) return { kind: "unavailable" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const responseStatus = response.status;
    const isSuccessful = response.ok || (response.ok === undefined && responseStatus >= 200 && responseStatus < 300);
    if (!isSuccessful) return { kind: "unavailable" };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { kind: "unavailable" };
    }
    return inspectPayment(body, paymentId, orderId, expectedCents);
  } catch {
    return { kind: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadVerifiedFees(sources: JsonObject): Promise<FeesResult> {
  let paymentOrders;
  try {
    paymentOrders = getPaymentOrdersForVerification(sources);
  } catch {
    return { ok: false, failure: { status: 500, message: SNAPSHOT_ERROR } };
  }
  if (paymentOrders.length === 0) return { ok: true, fees: new Map() };

  const token = process.env.MP_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, failure: { status: 503, message: MP_FEE_ERROR } };

  const requests = paymentOrders.map((order) => ({
    order,
    expectedCents: expectedOrderTotal(sources, order.id),
  }));
  if (requests.some(({ expectedCents }) => expectedCents === null)) {
    return { ok: false, failure: { status: 503, message: MP_FEE_ERROR } };
  }

  const fees = new Map<string, number>();
  // ponytail: batch online verification in groups of four; persist verified fees if volume grows.
  for (let start = 0; start < requests.length; start += 4) {
    const batch = requests.slice(start, start + 4);
    const results = await Promise.all(batch.map(({ order, expectedCents }) => (
      fetchPayment(order.mp_payment_id, order.id, expectedCents!, token)
    )));
    if (results.some((result) => result.kind === "unavailable")) {
      return { ok: false, failure: { status: 503, message: MP_FEE_ERROR } };
    }
    results.forEach((result, index) => {
      if (result.kind === "fee") fees.set(batch[index].order.id, result.cents);
    });
  }
  return { ok: true, fees };
}

function todayInRecife(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function validWithdrawalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && value <= todayInRecife();
}

function validText(value: unknown, optional: boolean): value is string {
  if (value === undefined && optional) return true;
  return typeof value === "string" && value.trim().length <= 300;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validateRecordBody(body: JsonObject): { id: string; owner: "rafael" | "renan"; amountCents: number; date: string; note: string } | null {
  if (!validUuid(body.id)) return null;
  if (body.owner !== "rafael" && body.owner !== "renan") return null;
  if (typeof body.amountCents !== "number" || !Number.isSafeInteger(body.amountCents) || body.amountCents <= 0) return null;
  if (!validWithdrawalDate(body.withdrawalDate)) return null;
  if (!validText(body.note, true)) return null;
  const note = body.note === undefined ? "" : body.note.trim();
  return { id: body.id, owner: body.owner, amountCents: body.amountCents, date: body.withdrawalDate, note };
}

function validateVoidBody(body: JsonObject): { id: string; reason: string } | null {
  if (!validUuid(body.id) || typeof body.reason !== "string") return null;
  const reason = body.reason.trim();
  return reason.length > 0 && reason.length <= 300 ? { id: body.id, reason } : null;
}

function isJsonObjectBody(body: unknown): body is JsonObject {
  return isRecord(body);
}

async function verifyAdmin(supabase: Supabase, req: VercelRequest): Promise<{ userId: string } | Failure> {
  const authorization = req.headers.authorization;
  const token = bearerToken(typeof authorization === "string" ? authorization : undefined);
  if (!token) return { status: 401, message: "Unauthorized" };

  try {
    const { data, error } = await supabase.auth.getUser(token);
    const user = data?.user;
    if (error || !user || !validUuid(user.id)) return { status: 401, message: "Unauthorized" };
    if (user.app_metadata?.role !== "admin") return { status: 403, message: FORBIDDEN_ERROR };
    return { userId: user.id };
  } catch {
    return { status: 401, message: "Unauthorized" };
  }
}

async function allowRequest(supabase: Supabase, userId: string): Promise<Failure | null> {
  try {
    if (await consumeRateLimit(supabase, "owner-finance", userId, 60, 60)) return null;
  } catch {
    return { status: 429, message: "Muitas requisições. Aguarde um momento." };
  }
  return { status: 429, message: "Muitas requisições. Aguarde um momento." };
}

async function recordWithdrawal(
  supabase: Supabase,
  body: JsonObject,
  userId: string,
  res: VercelResponse,
): Promise<VercelResponse> {
  const input = validateRecordBody(body);
  if (!input) return responseError(res, { status: 400, message: VALIDATION_ERROR });

  const snapshotResult = await loadSnapshot(supabase);
  if (!snapshotResult.ok) return responseError(res, snapshotResult.failure);
  const feesResult = await loadVerifiedFees(snapshotResult.snapshot.sources);
  if (!feesResult.ok) return responseError(res, feesResult.failure);

  let profitCents: number;
  try {
    profitCents = calculateOwnerProfit(snapshotResult.snapshot.sources, feesResult.fees).profitCents;
  } catch {
    return responseError(res, { status: 500, message: SNAPSHOT_ERROR });
  }

  try {
    const { data, error } = await supabase.rpc("record_owner_withdrawal", {
      p_id: input.id,
      p_owner: input.owner,
      p_amount_cents: input.amountCents,
      p_withdrawal_date: input.date,
      p_note: input.note,
      p_profit_cents: profitCents,
      p_fingerprint: snapshotResult.snapshot.fingerprint,
      p_actor: userId,
    });
    if (error) return responseError(res, mapRpcError(error));
    if (!isRecord(data)) return responseError(res, { status: 500, message: GENERIC_ERROR });
    return res.status(200).json({ withdrawal: data });
  } catch {
    return responseError(res, { status: 500, message: GENERIC_ERROR });
  }
}

async function voidWithdrawal(
  supabase: Supabase,
  body: JsonObject,
  userId: string,
  res: VercelResponse,
): Promise<VercelResponse> {
  const input = validateVoidBody(body);
  if (!input) return responseError(res, { status: 400, message: VALIDATION_ERROR });

  try {
    const { data, error } = await supabase.rpc("void_owner_withdrawal", {
      p_id: input.id,
      p_reason: input.reason,
      p_actor: userId,
    });
    if (error) return responseError(res, mapRpcError(error));
    if (!isRecord(data)) return responseError(res, { status: 500, message: GENERIC_ERROR });
    return res.status(200).json({ withdrawal: data });
  } catch {
    return responseError(res, { status: 500, message: GENERIC_ERROR });
  }
}

async function readFinance(supabase: Supabase, res: VercelResponse): Promise<VercelResponse> {
  const snapshotResult = await loadSnapshot(supabase);
  if (!snapshotResult.ok) return responseError(res, snapshotResult.failure);

  const feesResult = await loadVerifiedFees(snapshotResult.snapshot.sources);
  if (!feesResult.ok) return responseError(res, feesResult.failure);

  try {
    const summary = calculateOwnerProfit(snapshotResult.snapshot.sources, feesResult.fees);
    const balances = calculateOwnerBalances(summary.profitCents, snapshotResult.snapshot.withdrawals);
    return res.status(200).json({ summary, balances, withdrawals: snapshotResult.snapshot.withdrawals });
  } catch {
    return responseError(res, { status: 500, message: SNAPSHOT_ERROR });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = initSupabase();
  if (!supabase) return res.status(503).json({ error: "Serviço indisponível." });

  const admin = await verifyAdmin(supabase, req);
  if ("status" in admin) return responseError(res, admin);

  const rateFailure = await allowRequest(supabase, admin.userId);
  if (rateFailure) return responseError(res, rateFailure);

  if (req.method === "GET") return readFinance(supabase, res);
  if (!isJsonObjectBody(req.body) || typeof req.body.action !== "string") {
    return responseError(res, { status: 400, message: VALIDATION_ERROR });
  }
  if (req.body.action === "record") return recordWithdrawal(supabase, req.body, admin.userId, res);
  if (req.body.action === "void") return voidWithdrawal(supabase, req.body, admin.userId, res);
  return responseError(res, { status: 400, message: VALIDATION_ERROR });
}

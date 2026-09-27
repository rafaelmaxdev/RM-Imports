export interface MercadoPagoPaymentCandidate {
  id: unknown;
  status: unknown;
  external_reference: unknown;
  currency_id: unknown;
  transaction_amount: unknown;
  payment_type_id: unknown;
  money_release_date?: unknown;
  date_approved?: unknown;
}

export function mapMercadoPagoPaymentType(
  type: unknown,
): "pix" | "credit_card" | "debit_card" | undefined {
  switch (type) {
    case "credit_card":
    case "prepaid_card":
      return "credit_card";
    case "debit_card":
      return "debit_card";
    case "bank_transfer":
    case "ticket":
      return "pix";
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidPaymentId(value: unknown): boolean {
  if (typeof value === "string") return /^[0-9]{6,30}$/.test(value);
  return typeof value === "number"
    && Number.isInteger(value)
    && /^[0-9]{6,30}$/.test(String(value));
}

export function findApprovedPayment(
  candidates: unknown,
  orderId: string,
  expectedTotal: number,
): MercadoPagoPaymentCandidate | undefined {
  if (!Array.isArray(candidates) || typeof orderId !== "string" || !Number.isFinite(expectedTotal)) {
    return undefined;
  }

  for (const candidate of candidates) {
    if (
      !isRecord(candidate)
      || candidate.status !== "approved"
      || candidate.external_reference !== orderId
      || candidate.currency_id !== "BRL"
      || !hasValidPaymentId(candidate.id)
      || typeof candidate.transaction_amount !== "number"
      || !Number.isFinite(candidate.transaction_amount)
      || Math.abs(candidate.transaction_amount - expectedTotal) > 0.009
    ) {
      continue;
    }

    return candidate as unknown as MercadoPagoPaymentCandidate;
  }

  return undefined;
}

function parseDate(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function creditReleasePeriod(
  payment: unknown,
): "immediate" | "14_days" | "30_days" | undefined {
  if (!isRecord(payment) || payment.payment_type_id !== "credit_card") return undefined;

  const approvedAt = parseDate(payment.date_approved);
  const releaseAt = parseDate(payment.money_release_date);
  if (approvedAt === undefined || releaseAt === undefined || releaseAt < approvedAt) {
    return undefined;
  }

  const days = (releaseAt - approvedAt) / (24 * 60 * 60 * 1000);
  if (days <= 1) return "immediate";
  if (days <= 14) return "14_days";
  return "30_days";
}

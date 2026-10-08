const MIN_YEAR = 1900;
const MAX_YEAR = 2199;
const RECIFE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Recife",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/;

export interface DeliveryEstimate {
  startDate: string;
  endDate: string;
  shippedAt: string;
  overdue: boolean;
}

function parseCivilDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return null;

  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function dateStringRecife(date: Date): string | null {
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(RECIFE.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const value = `${parts.year}-${parts.month}-${parts.day}`;
  return parseCivilDate(value) === null ? null : value;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_WITH_TIMEZONE.test(value) || parseCivilDate(value.slice(0, 10)) === null) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function addCalendarDays(startDate: string, days: number): string {
  const date = parseCivilDate(startDate);
  if (date === null) throw new RangeError("Data inicial inválida ou fora do intervalo suportado.");
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new RangeError("A quantidade de dias corridos deve ser um inteiro entre 1 e 365.");
  }

  date.setUTCDate(date.getUTCDate() + days);
  if (date.getUTCFullYear() < MIN_YEAR || date.getUTCFullYear() > MAX_YEAR) {
    throw new RangeError("Data fora do intervalo suportado.");
  }
  return date.toISOString().slice(0, 10);
}

export function getStatusChangeTime(history: unknown, status: string): string | null {
  if (!Array.isArray(history)) return null;
  let latest: string | null = null;
  let latestTimestamp = -Infinity;
  for (const value of history) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const event = value as { status?: unknown; changed_at?: unknown };
    if (event.status !== status || typeof event.changed_at !== "string") continue;
    const timestamp = parseTimestamp(event.changed_at);
    if (timestamp === null || timestamp < latestTimestamp) continue;
    latestTimestamp = timestamp;
    latest = event.changed_at;
  }
  return latest;
}

export function getDeliveryEstimate(
  order: { status: string; status_history?: unknown },
  now: number = Date.now(),
): DeliveryEstimate | null {
  if (!order || typeof order !== "object" || order.status !== "a_caminho") return null;

  const changedAt = getStatusChangeTime(order.status_history, "a_caminho");
  const timestamp = parseTimestamp(changedAt);
  const shippedAt = timestamp === null ? null : dateStringRecife(new Date(timestamp));
  const today = dateStringRecife(new Date(now));
  if (shippedAt === null || today === null) return null;

  try {
    const startDate = addCalendarDays(shippedAt, 21);
    const endDate = addCalendarDays(shippedAt, 28);
    return { startDate, endDate, shippedAt, overdue: today > endDate };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

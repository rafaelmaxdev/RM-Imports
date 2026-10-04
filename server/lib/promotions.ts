export function isPromotionActive(endsAt?: string | null, now = Date.now()): boolean {
  if (endsAt == null || endsAt === "") return true;
  if (typeof endsAt !== "string") return false;

  const timestamp = Date.parse(endsAt);
  return Number.isFinite(timestamp) && now < timestamp;
}

export function promotionEndFromDate(date: string): string | null {
  if (date === "") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError("Data de promoção inválida.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(0);
  start.setUTCFullYear(year, month - 1, day);
  start.setUTCHours(0, 0, 0, 0);

  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day
  ) {
    throw new RangeError("Data de promoção inválida.");
  }

  return new Date(start.getTime() + 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString();
}

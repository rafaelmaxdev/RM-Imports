import { describe, expect, it } from "vitest";
import { formatRemaining, getRemainingParts } from "../PromotionCountdown";

describe("promotion countdown", () => {
  it("formats days, hours, minutes and seconds", () => {
    const now = Date.parse("2026-10-01T12:00:00.000Z");
    const endsAt = new Date(now + (27 * 24 + 4) * 60 * 60 * 1000 + 12 * 60 * 1000 + 9 * 1000).toISOString();

    expect(formatRemaining(endsAt, now)).toBe("27d 04h 12m 09s");
  });

  it("fails closed for missing, invalid and expired deadlines", () => {
    const now = Date.parse("2026-10-01T12:00:00.000Z");

    expect(formatRemaining(null, now)).toBeNull();
    expect(formatRemaining("invalid-date", now)).toBeNull();
    expect(formatRemaining("2026-10-01T12:00:00.000Z", now)).toBe("Oferta encerrada");
  });

  it("keeps days above 99 in the remaining parts", () => {
    const now = Date.parse("2026-10-01T12:00:00.000Z");
    const endsAt = new Date(now + (123 * 24 + 4) * 60 * 60 * 1000).toISOString();

    expect(getRemainingParts(endsAt, now)).toEqual({ days: 123, hours: 4, minutes: 0, seconds: 0, expired: false });
    expect(formatRemaining(endsAt, now)).toBe("123d 04h 00m 00s");
  });

  it("marks deadlines at or before now as expired", () => {
    const now = Date.parse("2026-10-01T12:00:00.000Z");

    expect(getRemainingParts("2026-10-01T12:00:00.000Z", now)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
    expect(getRemainingParts("2026-09-30T12:00:00.000Z", now)?.expired).toBe(true);
    expect(formatRemaining("2026-09-30T12:00:00.000Z", now)).toBe("Oferta encerrada");
  });
});

import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  getDeliveryEstimate,
  getStatusChangeTime,
} from "../lib/deliveryEstimate";

const shippedOnOctoberSeventh = {
  status: "a_caminho",
  status_history: [
    { status: "a_caminho", changed_at: "2026-10-07T05:34:00Z" },
  ],
};

describe("calendar days", () => {
  it.each([
    ["2026-06-10", "2026-07-01", "2026-07-08"],
    ["2026-04-28", "2026-05-19", "2026-05-26"],
    ["2026-10-07", "2026-10-28", "2026-11-04"],
  ])("calculates a 21-to-28-day window from %s", (startDate, expectedStart, expectedEnd) => {
    expect(getDeliveryEstimate({
      status: "a_caminho",
      status_history: [{ status: "a_caminho", changed_at: `${startDate}T12:00:00Z` }],
    }, Date.parse(`${startDate}T12:00:00Z`))).toEqual({
      shippedAt: startDate,
      startDate: expectedStart,
      endDate: expectedEnd,
      overdue: false,
    });
  });

  it("includes holidays and weekends and preserves Saturdays", () => {
    expect(addCalendarDays("2026-04-30", 1)).toBe("2026-05-01");
    expect(addCalendarDays("2026-10-09", 1)).toBe("2026-10-10");
    expect(addCalendarDays("2026-10-10", 21)).toBe("2026-10-31");
  });

  it("crosses years and leap days", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("rejects invalid day counts and dates", () => {
    expect(() => addCalendarDays("2026-10-07", 0)).toThrow(RangeError);
    expect(() => addCalendarDays("2026-10-07", Number.NaN)).toThrow(RangeError);
    expect(() => addCalendarDays("2026-10-07", 1.5)).toThrow(RangeError);
    expect(() => addCalendarDays("2026-10-07", 366)).toThrow(RangeError);
    expect(() => addCalendarDays("1899-12-31", 1)).toThrow(RangeError);
    expect(() => addCalendarDays("2026-02-29", 1)).toThrow(RangeError);
  });
});

describe("delivery estimate history", () => {
  it("uses the latest valid a_caminho event and ignores production events", () => {
    const history = [
      { status: "a_caminho", changed_at: "2026-10-02T15:00:00Z" },
      { status: "em_producao", changed_at: "2026-10-07T05:34:00Z" },
      { status: "a_caminho", changed_at: "2026-10-08T02:00:00Z" },
      { status: "em_producao", changed_at: "2026-10-08T02:00:00Z" },
    ];

    expect(getStatusChangeTime(history, "a_caminho")).toBe("2026-10-08T02:00:00Z");
    expect(getDeliveryEstimate({ status: "a_caminho", status_history: history }, Date.parse("2026-10-08T03:00:00Z"))).toMatchObject({
      shippedAt: "2026-10-07",
    });
  });

  it("ignores corrupted history and does not use production as a fallback", () => {
    const history: unknown[] = [
      null,
      { status: "a_caminho", changed_at: undefined },
      { status: "a_caminho", changed_at: "2026-02-30T15:00:00Z" },
      { status: "em_producao", changed_at: "2026-10-07T15:00:00Z" },
      { status: "status_invalido", changed_at: "2026-10-07T15:00:00Z" },
    ];

    expect(getStatusChangeTime(history, "a_caminho")).toBeNull();
    expect(getDeliveryEstimate({ status: "a_caminho", status_history: history }, Date.now())).toBeNull();
  });

  it("returns no estimate without a valid a_caminho history event", () => {
    expect(getDeliveryEstimate({ status: "a_caminho", created_at: "2026-10-07" } as never)).toBeNull();
    expect(getDeliveryEstimate({
      status: "a_caminho",
      status_history: [{ status: "em_producao", changed_at: "2026-10-07T05:34:00Z" }],
    })).toBeNull();
  });

  it("keeps the deadline inclusive for the whole Recife day", () => {
    const onDeadline = getDeliveryEstimate(shippedOnOctoberSeventh, Date.parse("2026-11-05T02:59:59Z"));
    const afterDeadline = getDeliveryEstimate(shippedOnOctoberSeventh, Date.parse("2026-11-05T03:00:00Z"));

    expect(onDeadline?.overdue).toBe(false);
    expect(afterDeadline?.overdue).toBe(true);
  });

  it("returns null for statuses that already passed the stock-arrival stage", () => {
    for (const status of ["em_producao", "pago", "cancelado", "reembolsado", "enviado_fornecedor", "em_estoque", "em_entrega", "entregue"]) {
      expect(getDeliveryEstimate({ ...shippedOnOctoberSeventh, status }, Date.parse("2030-01-01T12:00:00Z"))).toBeNull();
    }
  });

  it("does not mutate history", () => {
    const history = [{ status: "a_caminho", changed_at: "2026-10-07T05:34:00Z" }];
    const beforeHistory = JSON.stringify(history);

    getDeliveryEstimate({ status: "a_caminho", status_history: history }, Date.now());

    expect(JSON.stringify(history)).toBe(beforeHistory);
  });
});

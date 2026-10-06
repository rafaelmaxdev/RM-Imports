import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bearerToken: vi.fn(() => null),
  clientIp: vi.fn(() => "test-ip"),
  consumeRateLimit: vi.fn(async () => true),
  isAdminToken: vi.fn(async () => false),
  verifyOrderAccessToken: vi.fn(() => true),
  createClient: vi.fn(),
  preferenceCreate: vi.fn(),
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: vi.fn(),
  Preference: vi.fn(function PreferenceMock() {
    return { create: mocks.preferenceCreate };
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../../server/lib/security.js", () => ({
  bearerToken: mocks.bearerToken,
  clientIp: mocks.clientIp,
  consumeRateLimit: mocks.consumeRateLimit,
  isAdminToken: mocks.isAdminToken,
  verifyOrderAccessToken: mocks.verifyOrderAccessToken,
}));

const orderId = "UL-ABC23456";
const preferenceId = "PREF-123";
type DiagnosticLog = Record<string, unknown>;
type SupabaseOptions = {
  privateBuyer?: Record<string, unknown> | null;
  privateBuyerError?: { code: string; message?: string };
  privateBuyerThrows?: boolean;
};

function createSupabase(order: Record<string, unknown>, options: SupabaseOptions = {}) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      is: vi.fn(async () => ({ error: null })),
    })),
  }));
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({
      single: vi.fn(async () => ({ data: order, error: null })),
    })),
  }));
  const privateBuyerSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => {
        if (options.privateBuyerThrows) throw new Error("private buyer storage secret");
        return { data: options.privateBuyer ?? null, error: options.privateBuyerError ?? null };
      }),
    })),
  }));

  return {
    from: vi.fn((table: string) => {
      if (table === "pedidos") return { select, update };
      if (table === "pedido_payment_buyers") return { select: privateBuyerSelect };
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

function createRequest(body: unknown): VercelRequest {
  return {
    method: "POST",
    body,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as VercelRequest;
}

function createResponse() {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };

  return response as unknown as VercelResponse & { body: unknown };
}

function diagnosticLogs(consoleInfo: { mock: { calls: unknown[][] } }): DiagnosticLog[] {
  return consoleInfo.mock.calls.map(([entry]: unknown[]) => JSON.parse(String(entry)) as DiagnosticLog);
}

async function loadHandler(order: Record<string, unknown>, options: SupabaseOptions = {}) {
  mocks.createClient.mockReturnValue(createSupabase(order, options));
  vi.stubEnv("MP_ACCESS_TOKEN", "test-mp-token");
  vi.stubEnv("VITE_SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  vi.stubEnv("VITE_APP_URL", "https://app.test");
  vi.resetModules();
  const module = await import("../../api/create-preference");
  return module.default;
}

function orderWithPreference(mpPreferenceId?: string) {
  return {
    id: orderId,
    status: "pendente",
    total: 129.9,
    payment_method: "pix",
    mp_preference_id: mpPreferenceId,
    itens: [],
    endereco: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumeRateLimit.mockResolvedValue(true);
  mocks.isAdminToken.mockResolvedValue(false);
  mocks.verifyOrderAccessToken.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("create-preference diagnostics", () => {
  it("logs a valid new device without exposing it and forwards the same SDK options", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.preferenceCreate.mockResolvedValue({ id: preferenceId, init_point: "https://mp.test/init" });
    const handler = await loadHandler(orderWithPreference());
    const response = createResponse();

    await handler(createRequest({
      orderId,
      orderAccessToken: "ACCESS-TOKEN-SECRET",
      deviceId: "DEVICE-SECRET-DO-NOT-LOG",
    }), response);

    const logs = diagnosticLogs(consoleInfo);
    expect(logs.map((log) => log.phase)).toEqual(["create_requested", "created"]);
    expect(logs.every((log) => log.event === "mp_preference_device_diagnostic")).toBe(true);
    expect(logs.every((log) => typeof log.timestamp === "string" && !Number.isNaN(Date.parse(log.timestamp)))).toBe(true);
    expect(logs.every((log) => log.orderId === orderId)).toBe(true);
    expect(logs.every((log) => log.deviceIdRecebido === true)).toBe(true);
    expect(logs.every((log) => log.deviceIdValido === true)).toBe(true);
    expect(logs.every((log) => log.deviceIdEnviadoAoSDK === true)).toBe(true);
    expect(mocks.preferenceCreate).toHaveBeenCalledTimes(1);
    expect(mocks.preferenceCreate.mock.calls[0][0].requestOptions).toEqual({
      idempotencyKey: `preference-${orderId}`,
      meliSessionId: "DEVICE-SECRET-DO-NOT-LOG",
    });
    expect(JSON.stringify(logs)).not.toContain("DEVICE-SECRET-DO-NOT-LOG");
    expect(JSON.stringify(logs)).not.toContain("ACCESS-TOKEN-SECRET");
    expect(JSON.stringify(logs)).not.toContain("payer");
  });

  it("logs false booleans for an absent device on a successful creation", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.preferenceCreate.mockResolvedValue({ id: preferenceId, init_point: "https://mp.test/init" });
    const handler = await loadHandler(orderWithPreference());

    await handler(createRequest({ orderId, orderAccessToken: "ACCESS-TOKEN-SECRET" }), createResponse());

    const logs = diagnosticLogs(consoleInfo);
    expect(logs.map((log) => log.phase)).toEqual(["create_requested", "created"]);
    expect(logs.every((log) => log.deviceIdRecebido === false)).toBe(true);
    expect(logs.every((log) => log.deviceIdValido === false)).toBe(true);
    expect(logs.every((log) => log.deviceIdEnviadoAoSDK === false)).toBe(true);
    expect(mocks.preferenceCreate.mock.calls[0][0].requestOptions).toEqual({
      idempotencyKey: `preference-${orderId}`,
    });
    expect(JSON.stringify(logs)).not.toContain("ACCESS-TOKEN-SECRET");
    expect(JSON.stringify(logs)).not.toContain("payer");
  });

  it("logs reused preferences without creating or sending a device", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handler = await loadHandler(orderWithPreference(preferenceId));
    const response = createResponse();

    await handler(createRequest({
      orderId,
      orderAccessToken: "ACCESS-TOKEN-SECRET",
      deviceId: "DEVICE-SECRET-DO-NOT-LOG",
    }), response);

    const logs = diagnosticLogs(consoleInfo);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      phase: "reused",
      preferenceId,
      deviceIdRecebido: true,
      deviceIdValido: true,
      deviceIdEnviadoAoSDK: false,
    });
    expect(mocks.preferenceCreate).not.toHaveBeenCalled();
    const supabase = mocks.createClient.mock.results[0]?.value as { from: { mock: { calls: unknown[][] } } };
    expect(supabase.from.mock.calls.map(([table]) => table)).toEqual(["pedidos"]);
    expect(JSON.stringify(logs)).not.toContain("DEVICE-SECRET-DO-NOT-LOG");
    expect(JSON.stringify(logs)).not.toContain("ACCESS-TOKEN-SECRET");
    expect(JSON.stringify(logs)).not.toContain("payer");
  });

  it("loads private buyer identity into the payer without reading address identity", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.preferenceCreate.mockResolvedValue({ id: preferenceId, init_point: "https://mp.test/init" });
    const handler = await loadHandler(
      {
        ...orderWithPreference(),
        endereco: {
          nome: "Maria Silva",
          telefone: "(81) 99999-9999",
          deliveryMethod: "retirada",
          email: "attacker@example.com",
          cpf: "11111111111",
        },
      },
      { privateBuyer: { email: "buyer@example.com", cpf: "529.982.247-25" } },
    );

    const response = createResponse();
    await handler(createRequest({ orderId, orderAccessToken: "ACCESS-TOKEN-SECRET" }), response);

    expect(response.statusCode).toBe(200);
    expect(mocks.preferenceCreate.mock.calls[0][0]).toMatchObject({
      body: {
        payer: {
          name: "Maria",
          surname: "Silva",
          phone: { area_code: "81", number: "999999999" },
          email: "buyer@example.com",
          identification: { type: "CPF", number: "52998224725" },
        },
      },
    });
    const logs = diagnosticLogs(consoleInfo);
    expect(JSON.stringify(response.body)).not.toContain("buyer@example.com");
    expect(JSON.stringify(logs)).not.toContain("buyer@example.com");
    expect(JSON.stringify(logs)).not.toContain("52998224725");
    expect(JSON.stringify(logs)).not.toContain("attacker@example.com");
  });

  it("keeps legacy preferences without private buyer identity", async () => {
    mocks.preferenceCreate.mockResolvedValue({ id: preferenceId, init_point: "https://mp.test/init" });
    const handler = await loadHandler({
      ...orderWithPreference(),
      endereco: { nome: "Maria", email: "attacker@example.com", cpf: "52998224725" },
    });

    await handler(createRequest({ orderId, orderAccessToken: "ACCESS-TOKEN-SECRET" }), createResponse());

    expect(mocks.preferenceCreate.mock.calls[0][0].body.payer).toEqual({ name: "Maria" });
  });

  it.each(["42P01", "PGRST205"])('continues without buyer when private storage is missing (%s)', async (code) => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.preferenceCreate.mockResolvedValue({ id: preferenceId, init_point: "https://mp.test/init" });
    const handler = await loadHandler(orderWithPreference(), {
      privateBuyerError: { code, message: "table details must stay private" },
    });
    const response = createResponse();

    await handler(createRequest({ orderId, orderAccessToken: "ACCESS-TOKEN-SECRET" }), response);

    expect(response.statusCode).toBe(200);
    expect(consoleWarn).toHaveBeenCalledWith("private payment buyer storage unavailable");
    expect(mocks.preferenceCreate.mock.calls[0][0].body).not.toHaveProperty("payer");
  });

  it.each([
    ["error", { privateBuyerError: { code: "XX000", message: "buyer@example.com" } }],
    ["throw", { privateBuyerThrows: true }],
  ])("returns a generic error without calling the SDK when private storage %s", async (_case, options) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = await loadHandler(orderWithPreference(), options);
    const response = createResponse();

    await handler(createRequest({ orderId, orderAccessToken: "ACCESS-TOKEN-SECRET" }), response);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: "Não foi possível carregar os dados do pagamento." });
    expect(mocks.preferenceCreate).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("private payment buyer storage failure");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("buyer@example.com");
  });

  it("distinguishes an invalid received device and omits it from SDK options", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.preferenceCreate.mockResolvedValue({ id: preferenceId, init_point: "https://mp.test/init" });
    const handler = await loadHandler(orderWithPreference());

    await handler(createRequest({
      orderId,
      orderAccessToken: "ACCESS-TOKEN-SECRET",
      deviceId: "DEVICE-SECRET-DO-NOT-LOG\ninvalid",
    }), createResponse());

    const logs = diagnosticLogs(consoleInfo);
    expect(logs.map((log) => log.phase)).toEqual(["create_requested", "created"]);
    expect(logs.every((log) => log.deviceIdRecebido === true)).toBe(true);
    expect(logs.every((log) => log.deviceIdValido === false)).toBe(true);
    expect(logs.every((log) => log.deviceIdEnviadoAoSDK === false)).toBe(true);
    expect(mocks.preferenceCreate.mock.calls[0][0].requestOptions).toEqual({
      idempotencyKey: `preference-${orderId}`,
    });
    expect(JSON.stringify(logs)).not.toContain("DEVICE-SECRET-DO-NOT-LOG");
    expect(JSON.stringify(logs)).not.toContain("ACCESS-TOKEN-SECRET");
    expect(JSON.stringify(logs)).not.toContain("payer");
  });

  it("does not emit diagnostics for an unauthorized request", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.verifyOrderAccessToken.mockReturnValue(false);
    const handler = await loadHandler(orderWithPreference());

    await handler(createRequest({
      orderId,
      orderAccessToken: "ACCESS-TOKEN-SECRET",
      deviceId: "DEVICE-SECRET-DO-NOT-LOG",
    }), createResponse());

    expect(consoleInfo).not.toHaveBeenCalled();
    expect(mocks.preferenceCreate).not.toHaveBeenCalled();
    const supabase = mocks.createClient.mock.results[0]?.value as { from: { mock: { calls: unknown[][] } } };
    expect(supabase.from.mock.calls.map(([table]) => table)).not.toContain("pedido_payment_buyers");
  });
});

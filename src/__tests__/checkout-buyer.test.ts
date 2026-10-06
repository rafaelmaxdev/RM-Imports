import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientIp: vi.fn(() => "test-ip"),
  consumeRateLimit: vi.fn(async () => true),
  createOrderAccessToken: vi.fn(() => "order-access-token"),
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../../server/lib/security.js", () => ({
  clientIp: mocks.clientIp,
  consumeRateLimit: mocks.consumeRateLimit,
  createOrderAccessToken: mocks.createOrderAccessToken,
}));

const orderId = "UL-ABC23456";
const validCpf = "529.982.247-25";

type SupabaseOptions = {
  privateInsertError?: unknown;
  privateInsertThrows?: boolean;
  rollbackError?: unknown;
};

function createSupabase(options: SupabaseOptions = {}) {
  const calls = {
    from: [] as string[],
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    deletes: [] as string[],
    rpc: [] as string[],
  };

  const product = {
    id: "product-1",
    nome: "Camisa teste",
    time: null,
    tipo: "Torcedor",
    temporada: "2026/2027",
    yupoo_url: null,
    preco_customizado: null,
    promocao_tipo: null,
    promocao_valor: null,
    feminino: false,
  };

  const supabase = {
    from: vi.fn((table: string) => {
      calls.from.push(table);

      if (table === "pedidos") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
          insert: vi.fn((row: Record<string, unknown>) => {
            calls.inserts.push({ table, row });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { ...row }, error: null })),
              })),
            };
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(async (_column: string, id: string) => {
              calls.deletes.push(id);
              return { error: options.rollbackError ?? null };
            }),
          })),
        };
      }

      if (table === "produtos") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [product], error: null })),
          })),
        };
      }

      if (table === "loja_config") {
        return {
          select: vi.fn(async () => ({
            data: [{ key: "precos_base", value: { Torcedor: 129.90 } }],
            error: null,
          })),
        };
      }

      if (table === "pedido_payment_buyers") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            calls.inserts.push({ table, row });
            if (options.privateInsertThrows) throw new Error("network failure");
            return Promise.resolve({ error: options.privateInsertError ?? null });
          }),
        };
      }

      throw new Error(`unexpected table: ${table}`);
    }),
    rpc: vi.fn(async (name: string) => {
      calls.rpc.push(name);
      return { data: null, error: null };
    }),
  };

  return { supabase, calls };
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

  return response;
}

function checkoutBody(extra: Record<string, unknown> = {}) {
  return {
    orderId,
    paymentMethod: "pix",
    address: {
      nome: "Cliente",
      telefone: "(81) 99999-9999",
      deliveryMethod: "retirada",
      rua: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      estado: "",
      cep: "",
    },
    items: [{
      productId: "product-1",
      tamanho: "M",
      genero: "Masculino",
      personalizado: false,
      prontaEntrega: false,
    }],
    ...extra,
  };
}

async function loadHandler(supabase: unknown) {
  mocks.createClient.mockReturnValue(supabase);
  vi.stubEnv("VITE_SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  vi.resetModules();
  const module = await import("../../api/checkout");
  return module.default;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("checkout buyer identity", () => {
  it.each([
    ["e-mail", { email: "invalid", cpf: validCpf }, "Informe um e-mail válido."],
    ["CPF", { email: "buyer@example.com", cpf: "111.111.111-11" }, "Informe um CPF válido."],
  ])("rejects invalid %s before checkout side effects", async (_field, buyer, error) => {
    const { supabase, calls } = createSupabase();
    const handler = await loadHandler(supabase);
    const response = createResponse();

    await handler(createRequest(checkoutBody({ buyer })), response as unknown as VercelResponse);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error });
    expect(calls.from).toEqual([]);
    expect(calls.inserts).toEqual([]);
    expect(calls.rpc).toEqual([]);
  });

  it("stores a valid buyer privately and strips identity from the order", async () => {
    const { supabase, calls } = createSupabase();
    const handler = await loadHandler(supabase);
    const response = createResponse();
    const buyer = { email: "buyer@example.com", cpf: validCpf };
    const body = checkoutBody({
      buyer,
      address: {
        ...checkoutBody().address,
        email: "attacker@example.com",
        cpf: validCpf,
      },
    });

    await handler(createRequest(body), response as unknown as VercelResponse);

    expect(response.statusCode).toBe(201);
    expect(calls.inserts.filter(({ table }) => table === "pedido_payment_buyers")).toEqual([{
      table: "pedido_payment_buyers",
      row: { pedido_id: orderId, email: buyer.email, cpf: "52998224725" },
    }]);

    const orderInsert = calls.inserts.find(({ table }) => table === "pedidos")?.row;
    expect(orderInsert).toBeDefined();
    expect(orderInsert).not.toHaveProperty("buyer");
    expect(orderInsert?.endereco).toEqual({
      nome: "Cliente",
      rua: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      estado: "",
      cep: "",
      telefone: "5581999999999",
      deliveryMethod: "retirada",
    });
    expect(orderInsert?.endereco).not.toHaveProperty("email");
    expect(orderInsert?.endereco).not.toHaveProperty("cpf");
    expect(JSON.stringify(response.body)).not.toContain(buyer.email);
    expect(JSON.stringify(response.body)).not.toContain("52998224725");
  });

  it.each([
    ["returned error", { privateInsertError: new Error("storage failure") }],
    ["thrown network error", { privateInsertThrows: true }],
  ])("rolls back the order when private storage has a %s", async (_failure, options) => {
    const { supabase, calls } = createSupabase(options);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = await loadHandler(supabase);
    const response = createResponse();

    await handler(createRequest(checkoutBody({
      buyer: { email: "buyer@example.com", cpf: validCpf },
    })), response as unknown as VercelResponse);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: "Não foi possível salvar os dados do pagamento. Tente novamente." });
    expect(calls.deletes).toEqual([orderId]);
    expect(consoleError).toHaveBeenCalledWith("[api/checkout] failed to save payment data");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("buyer@example.com");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("52998224725");
  });

  it("keeps legacy checkout without private buyer storage", async () => {
    const { supabase, calls } = createSupabase();
    const handler = await loadHandler(supabase);
    const response = createResponse();

    await handler(createRequest(checkoutBody()), response as unknown as VercelResponse);

    expect(response.statusCode).toBe(201);
    expect(calls.inserts.map(({ table }) => table)).toEqual(["pedidos"]);
    expect(calls.from).not.toContain("pedido_payment_buyers");
  });
});

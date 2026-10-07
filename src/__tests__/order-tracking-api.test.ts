import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrderAccessToken } from "../../server/lib/security";

const {
  createClientMock,
  consumeRateLimitMock,
  fromMock,
  isAdminTokenMock,
  rpcMock,
  fetchMock,
} = vi.hoisted(() => {
  const from = vi.fn();
  const rpc = vi.fn();
  const supabase = { from, rpc, auth: { getUser: vi.fn() } };
  return {
    createClientMock: vi.fn(() => supabase),
    consumeRateLimitMock: vi.fn(),
    fromMock: from,
    isAdminTokenMock: vi.fn(),
    rpcMock: rpc,
    fetchMock: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
vi.mock("../../server/lib/cors.js", () => ({ setCorsHeaders: vi.fn() }));
vi.mock("../../server/lib/security.js", async () => {
  const actual = await vi.importActual<typeof import("../../server/lib/security.js")>(
    "../../server/lib/security.js",
  );
  return {
    ...actual,
    consumeRateLimit: consumeRateLimitMock,
    isAdminToken: isAdminTokenMock,
  };
});

vi.stubEnv("VITE_SUPABASE_URL", "https://unit-test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "dummy-service-role-key");
vi.stubEnv("MP_ACCESS_TOKEN", "");
vi.stubGlobal("fetch", fetchMock);

const { default: handler } = await import("../../api/order/[[...path]].ts");

const SERVICE_SECRET = "dummy-service-role-key";
const ORDER_ID = "UL-KZX9AL76";
const OTHER_ORDER_ID = "UL-ABCDEFGH";
const PHONE = "5581999999999";
const PHONE_INPUT = "(81) 99999-9999";
const WRONG_PHONE_INPUT = "(81) 88888-8888";
const PUBLIC_ORDER_FIELDS = "id,data,hora,itens,total,status,endereco,payment_method,mp_preference_id,pronta_entrega,created_at,telefone_normalizado,cupom_codigo,cupom_desconto";

const orderRow: Record<string, unknown> = {
  id: ORDER_ID,
  data: "07/10/2026",
  hora: "10:00",
  itens: JSON.stringify([{ nome: "Camisa", quantidade: 1, preco: 100 }]),
  total: 100,
  status: "pago",
  endereco: JSON.stringify({ cidade: "Recife" }),
  payment_method: "pix",
  mp_preference_id: "preference-test",
  pronta_entrega: false,
  created_at: "2026-10-07T13:00:00.000Z",
  telefone_normalizado: PHONE,
  cupom_codigo: "PROMO10",
  cupom_desconto: 10,
};

let selectedFields: string[];
let queriedTables: string[];
let filters: [string, unknown][];
let row: Record<string, unknown> | null;

type FakeQuery = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function makeQuery(): FakeQuery {
  const query = {} as FakeQuery;
  query.select = vi.fn().mockImplementation((fields: string) => {
    selectedFields.push(fields);
    return query;
  });
  query.eq = vi.fn().mockImplementation((field: string, value: unknown) => {
    filters.push([field, value]);
    return query;
  });
  query.maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  return query;
}

type RequestOptions = {
  id?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

function makeRequest({ id = ORDER_ID, query = {}, headers = {} }: RequestOptions = {}): VercelRequest {
  const path = query.path ?? id;
  return {
    method: "GET",
    query: { ...query, path },
    headers,
    url: `/api/order/${typeof path === "string" ? path : id}`,
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as VercelRequest;
}

function makeResponse() {
  const result: { statusCode: number; body: unknown; ended: boolean } = {
    statusCode: 200,
    body: undefined,
    ended: false,
  };
  const response = {
    status(code: number) {
      result.statusCode = code;
      return response;
    },
    json(body: unknown) {
      result.body = body;
      return response;
    },
    end() {
      result.ended = true;
      return response;
    },
    setHeader: vi.fn(),
  } as unknown as VercelResponse;
  return { response, result };
}

async function invoke(options: RequestOptions = {}) {
  const { response, result } = makeResponse();
  await handler(makeRequest(options), response);
  return result;
}

function expectPublicRead() {
  expect(queriedTables).toEqual(["pedidos"]);
  expect(selectedFields).toEqual([PUBLIC_ORDER_FIELDS]);
  expect(selectedFields.every((fields) => !/\*|email|cpf|buyer|secret|nome_cliente/i.test(fields))).toBe(true);
  expect(rpcMock).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  selectedFields = [];
  queriedTables = [];
  filters = [];
  row = { ...orderRow };
  fromMock.mockReset();
  rpcMock.mockReset();
  consumeRateLimitMock.mockReset().mockResolvedValue(true);
  isAdminTokenMock.mockReset().mockResolvedValue(false);
  fetchMock.mockReset();
  fromMock.mockImplementation((table: string) => {
    queriedTables.push(table);
    if (table !== "pedidos") throw new Error(`unexpected table: ${table}`);
    return makeQuery();
  });
});

describe("GET /api/order", () => {
  it("returns 401 for an ID without phone and does not query orders", async () => {
    const result = await invoke();

    expect(result.statusCode).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.body).toEqual({ error: "Informe o telefone usado no pedido." });
  });

  it("returns 404 for the wrong phone without exposing an access token", async () => {
    const result = await invoke({ headers: { "x-order-phone": WRONG_PHONE_INPUT } });

    expect(result.statusCode).toBe(404);
    expect(result.body).toEqual({ error: "Pedido não encontrado." });
    expect(result.body).not.toHaveProperty("orderAccessToken");
    expectPublicRead();
  });

  it("authorizes the correct phone header and returns only public coupon fields", async () => {
    const result = await invoke({ headers: { "x-order-phone": PHONE_INPUT } });
    const body = result.body as Record<string, unknown>;

    expect(result.statusCode).toBe(200);
    expect(body.cupom_codigo).toBe("PROMO10");
    expect(body.cupom_desconto).toBe(10);
    expect(body).not.toHaveProperty("telefone_normalizado");
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("cpf");
    expectPublicRead();
  });

  it("keeps the legacy phone query working", async () => {
    const result = await invoke({ query: { phone: PHONE_INPUT } });

    expect(result.statusCode).toBe(200);
    expect((result.body as Record<string, unknown>).cupom_codigo).toBe("PROMO10");
    expectPublicRead();
  });

  it("does not let a spoofed or unknown phone authorize an order", async () => {
    const result = await invoke({
      query: { phone: PHONE_INPUT },
      headers: { "x-order-phone": WRONG_PHONE_INPUT },
    });

    expect(result.statusCode).toBe(404);
    expect(result.body).not.toHaveProperty("orderAccessToken");
    expectPublicRead();
  });

  it("accepts a valid order token from the header without a phone", async () => {
    const token = createOrderAccessToken(ORDER_ID, SERVICE_SECRET);
    const result = await invoke({ headers: { "x-order-token": token } });

    expect(result.statusCode).toBe(200);
    expect((result.body as Record<string, unknown>).orderAccessToken).toBe(token);
    expectPublicRead();
  });

  it("rejects a token signed for another order before querying", async () => {
    const token = createOrderAccessToken(OTHER_ORDER_ID, SERVICE_SECRET);
    const result = await invoke({ headers: { "x-order-token": token } });

    expect(result.statusCode).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.body).not.toHaveProperty("orderAccessToken");
  });

  it("ignores token and accessToken query parameters", async () => {
    const token = createOrderAccessToken(ORDER_ID, SERVICE_SECRET);
    const result = await invoke({ query: { token, accessToken: token } });

    expect(result.statusCode).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid order ID", async () => {
    const result = await invoke({ id: "UL-invalid" });

    expect(result.statusCode).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 429 before touching the database when rate limited", async () => {
    consumeRateLimitMock.mockResolvedValueOnce(false);

    const result = await invoke({ headers: { "x-order-phone": PHONE_INPUT } });

    expect(result.statusCode).toBe(429);
    expect(fromMock).not.toHaveBeenCalled();
    expect(isAdminTokenMock).not.toHaveBeenCalled();
  });

  it("requires a phone for payment lookup without an order ID", async () => {
    const result = await invoke({
      id: undefined,
      query: { path: "search", payment: "123456789" },
    });

    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({ error: "Informe o telefone usado no pedido." });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("authorizes payment lookup with the phone header and parses the public order", async () => {
    const result = await invoke({
      id: undefined,
      query: { path: "search", payment: "123456789" },
      headers: { "x-order-phone": PHONE_INPUT },
    });
    const body = result.body as Record<string, unknown>;

    expect(result.statusCode).toBe(200);
    expect(body.itens).toEqual([{ nome: "Camisa", quantidade: 1, preco: 100 }]);
    expect(body.endereco).toEqual({ cidade: "Recife" });
    expect(body.cupom_codigo).toBe("PROMO10");
    expect(body).not.toHaveProperty("telefone_normalizado");
    expect(filters).toContainEqual(["mp_payment_id", "123456789"]);
    expectPublicRead();
  });
});

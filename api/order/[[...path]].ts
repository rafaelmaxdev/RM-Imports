import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { setCorsHeaders } from "../../server/lib/cors.js";
import { normalizeBrazilPhone } from "../../server/lib/checkout.js";
import {
  bearerToken,
  clientIp,
  consumeRateLimit,
  createOrderAccessToken,
  isAdminToken,
  verifyOrderAccessToken,
} from "../../server/lib/security.js";
import {
  creditReleasePeriod,
  findApprovedPayment,
  isMissingCreditReleasePeriodColumn,
  mapMercadoPagoPaymentType,
} from "../../server/lib/payment-reconciliation.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mpAccessToken = process.env.MP_ACCESS_TOKEN;

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

const PUBLIC_ORDER_FIELDS = "id,data,hora,itens,total,status,endereco,payment_method,mp_preference_id,pronta_entrega,created_at,telefone_normalizado,cupom_codigo,cupom_desconto";
const ORDER_ID_PATTERN = /^UL-[A-Z2-9]{8}$/;

function flattenCandidates(value: unknown): unknown[] {
  return Array.isArray(value) ? value.flatMap(flattenCandidates) : [value];
}

export function resolveOrderPath(rawPath: unknown, url?: string): string | undefined {
  const candidates = flattenCandidates(rawPath)
    .flatMap((value) => typeof value === "string" ? value.split("/") : [])
    .filter(Boolean);
  const urlMatch = url?.match(/\/api\/order\/([^/?#]+)/);
  if (urlMatch) candidates.push(decodeURIComponent(urlMatch[1]));

  return candidates.find((candidate) => candidate === "search" || ORDER_ID_PATTERN.test(candidate))
    ?? candidates.at(-1);
}

function requestedPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return normalizeBrazilPhone(value);
  } catch {
    return null;
  }
}

function publicOrder(order: Record<string, unknown>, accessToken: string) {
  const safe = { ...order };
  delete safe.telefone_normalizado;
  return {
    ...safe,
    itens: typeof safe.itens === "string" ? JSON.parse(safe.itens) : safe.itens,
    endereco: typeof safe.endereco === "string" ? JSON.parse(safe.endereco) : safe.endereco,
    orderAccessToken: accessToken,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function reconcilePendingPayment(order: Record<string, unknown>) {
  if (!mpAccessToken || order.status !== "pendente") return order;
  if (typeof order.id !== "string" || !ORDER_ID_PATTERN.test(order.id)) return order;

  const total = Number(order.total);
  if (!Number.isFinite(total)) return order;
  if (!supabase) return order;

  let payload: unknown;
  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc&limit=10`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw new Error("Mercado Pago request failed");
    payload = await response.json();
  } catch {
    console.warn("[order] payment reconciliation unavailable");
    return order;
  }

  const results = isRecord(payload) ? payload.results : undefined;
  const payment = findApprovedPayment(results, order.id, Number(order.total));
  if (!payment) return order;

  const updateData: Record<string, unknown> = {
    status: "pago",
    mp_payment_id: String(payment.id),
  };
  const paymentMethod = mapMercadoPagoPaymentType(payment.payment_type_id);
  if (paymentMethod) updateData.payment_method = paymentMethod;
  const releasePeriod = creditReleasePeriod(payment);
  if (releasePeriod) updateData.credit_release_period = releasePeriod;

  let updatedOrder: Record<string, unknown> | null;
  let updateError: unknown;
  try {
    let result = await supabase
      .from("pedidos")
      .update(updateData)
      .eq("id", order.id)
      .eq("status", "pendente")
      .select(PUBLIC_ORDER_FIELDS)
      .maybeSingle();

    if (isMissingCreditReleasePeriodColumn(result.error) && releasePeriod) {
      delete updateData.credit_release_period;
      result = await supabase
        .from("pedidos")
        .update(updateData)
        .eq("id", order.id)
        .eq("status", "pendente")
        .select(PUBLIC_ORDER_FIELDS)
        .maybeSingle();
    }

    updatedOrder = result.data as Record<string, unknown> | null;
    updateError = result.error;
  } catch {
    console.warn("[order] payment reconciliation update failed");
    return order;
  }

  if (updateError) {
    console.warn("[order] payment reconciliation update failed");
    return order;
  }

  if (!updatedOrder) {
    try {
      const { data: currentOrder } = await supabase
        .from("pedidos")
        .select(PUBLIC_ORDER_FIELDS)
        .eq("id", order.id)
        .maybeSingle();
      return (currentOrder as Record<string, unknown> | null) ?? order;
    } catch {
      console.warn("[order] payment reconciliation reload failed");
      return order;
    }
  }

  try {
    const { error: couponError } = await supabase.rpc("finalizar_uso_cupom", {
      p_pedido_id: order.id,
      p_status: "confirmado",
    });
    if (couponError) console.warn("[order] coupon confirmation failed");
  } catch {
    console.warn("[order] coupon confirmation failed");
  }

  return updatedOrder;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!supabase || !serviceRoleKey) return res.status(500).json({ error: "Serviço indisponível." });
  const ip = clientIp(req.headers, req.socket.remoteAddress);
  if (!await consumeRateLimit(supabase, "order", ip, 30, 60)) {
    return res.status(429).json({ error: "Muitas requisições. Aguarde um momento." });
  }

  const path = resolveOrderPath([req.query.path, req.query.id], req.url);
  const payment = req.query.payment;
  const phone = requestedPhone(req.headers["x-order-phone"] ?? req.query.phone);
  const admin = await isAdminToken(supabase, bearerToken(req.headers.authorization));

  if (req.method === "POST") {
    if (!admin) return res.status(403).json({ error: "Forbidden: admin role required" });
    if (!path || !ORDER_ID_PATTERN.test(path)) return res.status(400).json({ error: "ID do pedido inválido." });

    const status = (req.body as { status?: unknown } | null)?.status;
    if (status !== "cancelado" && status !== "reembolsado") {
      return res.status(400).json({ error: "Status final inválido." });
    }

    let result = await supabase.rpc("finalize_order_admin", {
      p_order_id: path,
      p_status: status,
    });
    if (result.error) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      result = await supabase.rpc("finalize_order_admin", {
        p_order_id: path,
        p_status: status,
      });
    }
    if (result.error) {
      console.error("[order] failed to finalize order", {
        code: result.error.code,
        message: result.error.message,
      });
      return res.status(500).json({ error: "Não foi possível finalizar o pedido." });
    }
    return res.status(200).json({ success: true });
  }

  // ── Payment ID search ──
  if (path === "search") {
    if (typeof payment !== "string" || !/^\d{6,30}$/.test(payment)) {
      return res.status(400).json({ error: "Informe um ID de pagamento com 6 a 30 dígitos." });
    }
    if (!phone) return res.status(400).json({ error: "Informe o telefone usado no pedido." });

    const { data: order } = await supabase
      .from("pedidos")
      .select(PUBLIC_ORDER_FIELDS)
      .eq("mp_payment_id", payment)
      .maybeSingle();

    if (!order || order.telefone_normalizado !== phone) {
      return res.status(404).json({ error: "Nenhum pedido encontrado com esses dados." });
    }

    return res.status(200).json(publicOrder(order, createOrderAccessToken(order.id, serviceRoleKey)));
  }

  // ── Order ID search ──
  const id = path;
  if (!id) return res.status(400).json({ error: "Informe o ID do pedido." });
  if (!ORDER_ID_PATTERN.test(id)) return res.status(400).json({ error: "ID do pedido inválido." });

  if (admin) {
    const { data: order } = await supabase.from("pedidos").select("*").eq("id", id).single();
    if (!order) return res.status(404).json({ error: "Order not found" });
    const reconciledOrder = await reconcilePendingPayment(order);
    return res.status(200).json({
      ...reconciledOrder,
      itens: typeof reconciledOrder.itens === "string" ? JSON.parse(reconciledOrder.itens) : reconciledOrder.itens,
      endereco: reconciledOrder.endereco ? (typeof reconciledOrder.endereco === "string" ? JSON.parse(reconciledOrder.endereco) : reconciledOrder.endereco) : null,
    });
  }

  const orderTokenHeader = Array.isArray(req.headers["x-order-token"])
    ? req.headers["x-order-token"][0]
    : req.headers["x-order-token"];
  const tokenIsValid = verifyOrderAccessToken(id, orderTokenHeader, serviceRoleKey);
  if (!tokenIsValid && !phone) {
    return res.status(401).json({ error: "Informe o telefone usado no pedido." });
  }

  const { data: order } = await supabase
    .from("pedidos")
    .select(PUBLIC_ORDER_FIELDS)
    .eq("id", id)
    .maybeSingle();

  if (!order || (!tokenIsValid && order.telefone_normalizado !== phone)) {
    return res.status(404).json({ error: "Pedido não encontrado." });
  }
  const reconciledOrder = await reconcilePendingPayment(order);
  return res.status(200).json(publicOrder(reconciledOrder, createOrderAccessToken(order.id, serviceRoleKey)));
}

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

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

const PUBLIC_ORDER_FIELDS = "id,data,hora,itens,total,status,endereco,payment_method,mp_preference_id,pronta_entrega,created_at,telefone_normalizado";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!supabase || !serviceRoleKey) return res.status(500).json({ error: "Serviço indisponível." });
  const ip = clientIp(req.headers, req.socket.remoteAddress);
  if (!await consumeRateLimit(supabase, "order", ip, 30, 60)) {
    return res.status(429).json({ error: "Muitas requisições. Aguarde um momento." });
  }

  const rawPath = req.query.path;
  const path = Array.isArray(rawPath) ? rawPath[0] : rawPath;
  const payment = req.query.payment;
  const phone = requestedPhone(req.query.phone);
  const admin = await isAdminToken(supabase, bearerToken(req.headers.authorization));

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
  let id: string | undefined;

  if (path && typeof path === "string") id = path;
  if (!id && req.url) {
    const match = req.url.split("?")[0].match(/\/order\/([^/]+)$/);
    if (match) id = decodeURIComponent(match[1]);
  }
  if (!id) {
    const queryId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (typeof queryId === "string" && queryId) id = queryId;
  }
  if (!id) return res.status(400).json({ error: "Informe o ID do pedido." });
  if (!/^UL-[A-Z2-9]{8}$/.test(id)) return res.status(400).json({ error: "ID do pedido inválido." });

  if (admin) {
    const { data: order } = await supabase.from("pedidos").select("*").eq("id", id).single();
    if (!order) return res.status(404).json({ error: "Order not found" });
    return res.status(200).json({
      ...order,
      itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens,
      endereco: order.endereco ? (typeof order.endereco === "string" ? JSON.parse(order.endereco) : order.endereco) : null,
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
  return res.status(200).json(publicOrder(order, createOrderAccessToken(order.id, serviceRoleKey)));
}

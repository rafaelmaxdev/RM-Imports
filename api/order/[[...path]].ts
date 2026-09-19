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
  const phone = requestedPhone(req.query.phone);
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

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { setCorsHeaders } from "../lib/cors.js";

const rateLimitHits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitHits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitHits.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error("[api/order] SUPABASE_SERVICE_ROLE_KEY not configured");
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  serviceRoleKey!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) return res.status(429).json({ error: "Muitas requisições. Aguarde um momento." });

  const rawPath = req.query.path;
  const path = Array.isArray(rawPath) ? rawPath[0] : rawPath;
  const phone = Array.isArray(req.query.phone) ? req.query.phone[0] : req.query.phone;
  const payment = Array.isArray(req.query.payment) ? req.query.payment[0] : req.query.payment;

  // ── Phone search ──
  if (path === "search" || phone) {
    if (!phone || typeof phone !== "string") return res.status(400).json({ error: "Informe o telefone." });
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return res.status(400).json({ error: "Telefone deve ter pelo menos 10 dígitos." });

    const { data: orders } = await supabase.from("pedidos").select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at, endereco").order("created_at", { ascending: false });

    const last8 = digits.slice(-8);
    const filtered = (orders || []).filter((o: any) => {
      if (!o.endereco) return false;
      try {
        const addr = typeof o.endereco === "string" ? JSON.parse(o.endereco) : o.endereco;
        const clean = (addr.telefone || "").replace(/\D/g, "");
        return clean.includes(digits) || digits.includes(clean) || clean.endsWith(last8) || last8.endsWith(clean);
      } catch { return false; }
    });

    if (filtered.length === 0) return res.status(404).json({ error: "Nenhum pedido encontrado com esse telefone." });

    const parsed = filtered.map((o: any) => {
      const { endereco, ...rest } = o;
      return { ...rest, itens: typeof o.itens === "string" ? JSON.parse(o.itens) : o.itens };
    });
    return res.status(200).json(parsed);
  }

  // ── Payment ID search ──
  if (payment && typeof payment === "string") {
    const { data: order } = await supabase
      .from("pedidos")
      .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at")
      .eq("mp_payment_id", payment.trim())
      .maybeSingle();

    if (!order) return res.status(404).json({ error: "Nenhum pedido encontrado com esse ID de pagamento." });

    return res.status(200).json([{ ...order, itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens }]);
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
  if (!id) return res.status(400).json({ error: "Informe o ID do pedido, telefone ou ID do pagamento." });

  // Authenticated — return full data
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      const { data: order } = await supabase.from("pedidos").select("*").eq("id", id).single();
      if (!order) return res.status(404).json({ error: "Order not found" });
      return res.status(200).json({
        ...order,
        itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens,
        endereco: order.endereco ? (typeof order.endereco === "string" ? JSON.parse(order.endereco) : order.endereco) : null,
      });
    }
  }

  // Public — return limited data
  const { data: order } = await supabase
    .from("pedidos")
    .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  return res.status(200).json([{ ...order, itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens }]);
}

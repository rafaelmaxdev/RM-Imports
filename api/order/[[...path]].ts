import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { setCorsHeaders } from "../lib/cors.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Extract order ID from path
  let id: string | undefined;

  const { path } = req.query;
  if (Array.isArray(path)) {
    id = path[0];
  } else if (typeof path === "string" && path) {
    id = path;
  }

  if (!id && req.url) {
    const cleanUrl = req.url.split("?")[0].split("#")[0];
    const match = cleanUrl.match(/\/order\/([^/]+)$/);
    if (match) id = decodeURIComponent(match[1]);
  }

  if (!id && req.url) {
    try {
      const urlPath = new URL(req.url, `https://${req.headers.host || "localhost"}`).pathname;
      const match = urlPath.match(/\/order\/([^/]+)$/);
      if (match) id = decodeURIComponent(match[1]);
    } catch {}
  }

  if (!id) {
    const queryId = req.query.id;
    if (typeof queryId === "string" && queryId) id = queryId;
  }

  if (!id) {
    // Phone or payment search (public)
    const phone = req.query.phone;
    const payment = req.query.payment;

    if (phone && typeof phone === "string") {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 8) {
        return res.status(400).json({ error: "Telefone deve ter pelo menos 8 dígitos." });
      }
      const { data: orders } = await supabase
        .from("pedidos")
        .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      const filtered = (orders || []).filter((o: any) => {
        if (!o.endereco) return false;
        const addr = typeof o.endereco === "string" ? JSON.parse(o.endereco) : o.endereco;
        const telDigits = addr.telefone?.replace(/\D/g, "") || "";
        return telDigits.includes(digits) || digits.includes(telDigits);
      });
      if (filtered.length === 0) {
        return res.status(404).json({ error: "Nenhum pedido encontrado com esse telefone." });
      }
      const parsed = filtered.map((o: any) => ({ ...o, itens: typeof o.itens === "string" ? JSON.parse(o.itens) : o.itens }));
      return res.status(200).json(Array.isArray(parsed) ? parsed : [parsed]);
    }

    if (payment && typeof payment === "string") {
      const pid = payment.trim();
      const { data: order } = await supabase
        .from("pedidos")
        .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at")
        .eq("mp_payment_id", pid)
        .maybeSingle();
      if (!order) {
        return res.status(404).json({ error: "Nenhum pedido encontrado com esse ID de pagamento." });
      }
      const parsed = { ...order, itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens };
      return res.status(200).json([parsed]);
    }

    return res.status(400).json({ error: "Informe o ID do pedido, telefone ou ID do pagamento." });
  }

  // Authenticated request for full order data
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (token) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (!authError && user) {
      const { data: order, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const parsed = {
        ...order,
        itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens,
        endereco: order.endereco
          ? (typeof order.endereco === "string" ? JSON.parse(order.endereco) : order.endereco)
          : null,
      };

      return res.status(200).json(parsed);
    }
  }

  // Public request — return limited data
  const { data: order, error } = await supabase
    .from("pedidos")
    .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    return res.status(404).json({ error: "Pedido não encontrado." });
  }

  const parsed = { ...order, itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens };
  return res.status(200).json([parsed]);
}

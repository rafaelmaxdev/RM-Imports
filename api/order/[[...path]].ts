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

  const rawPath = req.query.path;
  const path = Array.isArray(rawPath) ? rawPath[0] : rawPath;
  if (path && typeof path === "string") id = path;

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
    const rawId = req.query.id;
    const queryId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (typeof queryId === "string" && queryId) id = queryId;
  }

  if (!id) {
    // Phone or payment search (public)
    let phone = req.query.phone;
    let payment = req.query.payment;
    if (Array.isArray(phone)) phone = phone[0];
    if (Array.isArray(payment)) payment = payment[0];

    if (phone && typeof phone === "string") {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10) {
        return res.status(400).json({ error: "Telefone deve ter pelo menos 10 dígitos (DDD + número)." });
      }
      const { data: orders, error: fetchError } = await supabase
        .from("pedidos")
        .select("*")
        .order("created_at", { ascending: false });
      if (fetchError) {
        return res.status(500).json({ error: "Erro ao buscar pedidos.", fetchError: fetchError.message });
      }
      const last8 = digits.slice(-8);
      const filtered = (orders || []).filter((o: any) => {
        if (!o.endereco) return false;
        try {
          const addr = typeof o.endereco === "string" ? JSON.parse(o.endereco) : o.endereco;
          const raw = addr.telefone || "";
          const clean = raw.replace(/\D/g, "");
          return clean.includes(digits) || digits.includes(clean) || clean.endsWith(last8) || last8.endsWith(clean);
        } catch { return false; }
      });
      if (filtered.length === 0) {
        const sample = (orders || []).slice(0, 3).map((o: any) => {
          try {
            const addr = typeof o.endereco === "string" ? JSON.parse(o.endereco) : o.endereco;
            return { id: o.id, tel: addr?.telefone, telClean: addr?.telefone?.replace(/\D/g, "") };
          } catch { return { id: o.id, enderecoType: typeof o.endereco, endereco: String(o.endereco).slice(0, 100) }; }
        });
        return res.status(404).json({ error: "Nenhum pedido encontrado.", debug: { total: orders?.length, digits, last8, sample } });
      }
      const parsed = filtered.map((o: any) => {
        const { endereco, ...rest } = o;
        return { ...rest, itens: typeof o.itens === "string" ? JSON.parse(o.itens) : o.itens };
      });
      return res.status(200).json(Array.isArray(parsed) ? parsed : [parsed]);
    }

    if (payment && typeof payment === "string") {
      const pid = payment.trim();
      const { data: order } = await supabase
        .from("pedidos")
        .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at, endereco")
        .eq("mp_payment_id", pid)
        .maybeSingle();
      if (!order) {
        return res.status(404).json({ error: "Nenhum pedido encontrado com esse ID de pagamento." });
      }
      const { endereco: _, ...rest } = order;
      const parsed = { ...rest, itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens };
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
    .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at, endereco")
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    return res.status(404).json({ error: "Pedido não encontrado." });
  }

  const { endereco: _, ...rest } = order;
  const parsed = { ...rest, itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens };
  return res.status(200).json([parsed]);
}

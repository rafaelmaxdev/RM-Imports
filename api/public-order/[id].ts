import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const phone = req.query.phone;
  const payment = req.query.payment;

  // Search by payment ID
  if (payment && typeof payment === "string") {
    const pid = payment.trim();
    const { data: order } = await supabase
      .from("pedidos")
      .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at")
      .eq("mp_payment_id", pid)
      .maybeSingle();
    if (order) {
      const parsed = { ...order, itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens };
      return res.status(200).json([parsed]);
    }
    return res.status(404).json({ error: "Nenhum pedido encontrado com esse ID de pagamento." });
  }

  // Search by phone number
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
      return addr.telefone?.replace(/\D/g, "").includes(digits) || digits.includes(addr.telefone?.replace(/\D/g, "") || "");
    });
    if (filtered.length === 0) {
      return res.status(404).json({ error: "Nenhum pedido encontrado com esse telefone." });
    }
    const parsed = filtered.map((o: any) => ({ ...o, itens: typeof o.itens === "string" ? JSON.parse(o.itens) : o.itens }));
    return res.status(200).json(parsed);
  }

  // Search by order ID
  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Informe o ID do pedido, telefone ou ID do pagamento." });
  }

  const { data: order } = await supabase
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

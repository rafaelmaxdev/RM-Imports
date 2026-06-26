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

  if (phone && typeof phone === "string") {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      return res.status(400).json({ error: "Telefone deve ter pelo menos 10 dígitos (DDD + número)." });
    }
    const { data: orders } = await supabase
      .from("pedidos")
      .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at, endereco")
      .order("created_at", { ascending: false });
    const last8 = digits.slice(-8);
    const filtered = (orders || []).filter((o: any) => {
      if (!o.endereco) return false;
      const addr = typeof o.endereco === "string" ? JSON.parse(o.endereco) : o.endereco;
      const raw = addr.telefone || "";
      const clean = raw.replace(/\D/g, "");
      return clean.includes(digits) || digits.includes(clean) || clean.endsWith(last8) || last8.endsWith(clean);
    });
    if (filtered.length === 0) {
      return res.status(404).json({ error: "Nenhum pedido encontrado com esse telefone." });
    }
    const parsed = filtered.map((o: any) => {
      const { endereco, ...rest } = o;
      return { ...rest, itens: typeof o.itens === "string" ? JSON.parse(o.itens) : o.itens };
    });
    return res.status(200).json(parsed);
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

  return res.status(400).json({ error: "Informe telefone ou ID do pagamento." });
}

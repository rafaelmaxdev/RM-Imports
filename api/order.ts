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

  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing order ID" });
  }

  try {
    const { data: order, error } = await supabase
      .from("pedidos")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Parse JSONB fields
    const parsed = {
      ...order,
      itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens,
      endereco: order.endereco
        ? (typeof order.endereco === "string" ? JSON.parse(order.endereco) : order.endereco)
        : null,
    };

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Error fetching order:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
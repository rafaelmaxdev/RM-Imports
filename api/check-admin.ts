import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { bearerToken, isAdminToken } from "../server/lib/security.js";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabase = serviceRoleKey && supabaseUrl ? createClient(supabaseUrl, serviceRoleKey) : null;

async function autoCancelExpiredOrders(hours = 24): Promise<number> {
  if (!supabase) return 0;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data: expired } = await supabase
    .from("pedidos")
    .select("id")
    .eq("status", "pendente")
    .lt("created_at", cutoff);
  if (!expired?.length) return 0;

  let cancelled = 0;
  for (const order of expired) {
    const { error } = await supabase.rpc("finalize_order_admin", {
      p_order_id: order.id,
      p_status: "cancelado",
    });
    if (error) {
      console.warn("[check-admin] failed to finalize expired order");
      continue;
    }
    cancelled++;
  }
  return cancelled;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabase) return res.status(500).json({ error: "Serviço indisponível." });
  const action = typeof req.query.action === "string" ? req.query.action : null;

  if (action === "cancel") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || bearerToken(req.headers.authorization) !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.status(200).json({ cancelled: await autoCancelExpiredOrders(24) });
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const isAdmin = await isAdminToken(supabase, bearerToken(req.headers.authorization));
    return res.status(200).json({ isAdmin });
  } catch {
    return res.status(200).json({ isAdmin: false });
  }
}

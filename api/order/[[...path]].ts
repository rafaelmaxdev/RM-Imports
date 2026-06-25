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

  // Authenticate: require valid session token
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  // Extract order ID from path: /api/order/UL-XXXX
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
    if (match) {
      id = decodeURIComponent(match[1]);
    }
  }

  if (!id && req.url) {
    try {
      const urlPath = new URL(req.url, `https://${req.headers.host || "localhost"}`).pathname;
      const match = urlPath.match(/\/order\/([^/]+)$/);
      if (match) {
        id = decodeURIComponent(match[1]);
      }
    } catch {}
  }

  if (!id) {
    const queryId = req.query.id;
    if (typeof queryId === "string" && queryId) {
      id = queryId;
    }
  }

  if (!id) {
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
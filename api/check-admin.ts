import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error("[check-admin] SUPABASE_SERVICE_ROLE_KEY not configured");
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  serviceRoleKey || process.env.VITE_SUPABASE_ANON_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return res.status(200).json({ isAdmin: false });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(200).json({ isAdmin: false });
    }

    const jwtRole = user.app_metadata?.role;
    if (jwtRole === "admin") {
      return res.status(200).json({ isAdmin: true });
    }

    const { data: adminUser, error: adminError } = await supabase.auth.admin.getUserById(user.id);
    if (!adminError && adminUser?.user?.app_metadata?.role === "admin") {
      return res.status(200).json({ isAdmin: true });
    }

    const { data: dbMeta, error: rpcError } = await supabase.rpc("get_user_role", { uid: user.id });
    if (!rpcError && dbMeta?.role === "admin") {
      return res.status(200).json({ isAdmin: true });
    }

    return res.status(200).json({ isAdmin: false });
  } catch {
    return res.status(200).json({ isAdmin: false });
  }
}

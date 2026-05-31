import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MercadoPagoConfig, PaymentRefund } from "mercadopago";
import { createClient } from "@supabase/supabase-js";

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  options: { timeout: 5000 },
});

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.warn("[refund] SUPABASE_SERVICE_ROLE_KEY not set — refund operations may fail");
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  serviceRoleKey || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify admin role — check app_metadata from JWT first,
    // then query auth.users directly (service role) as authoritative source.
    // Never trust user_metadata (client-writable = privilege escalation).
    const jwtRole = user.app_metadata?.role;
    if (jwtRole === "admin") {
      // Fast path: JWT already has admin claim
    } else {
      // Authoritative check: query auth.users with service role key
      const { data: adminUser, error: adminError } = await supabase.auth.admin.getUserById(user.id);
      if (adminError || !adminUser) {
        return res.status(403).json({ error: "Forbidden: admin role required" });
      }
      const dbRole = adminUser.user?.app_metadata?.role;
      if (dbRole !== "admin") {
        return res.status(403).json({ error: "Forbidden: admin role required" });
      }
    }

    const { orderId } = req.body as { orderId: string };

    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    // Fetch order from Supabase to get the MP payment ID
    const { data: order, error: dbError } = await supabase
      .from("pedidos")
      .select("id, status, mp_payment_id")
      .eq("id", orderId)
      .single();

    if (dbError || !order) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    if (order.status !== "pago") {
      return res.status(400).json({ error: "Apenas pedidos pagos podem ser reembolsados" });
    }

    if (!order.mp_payment_id) {
      return res.status(400).json({ error: "Pedido sem ID de pagamento no Mercado Pago" });
    }

    // Issue full refund via Mercado Pago
    const refundApi = new PaymentRefund(mpClient);
    const refundResult = await refundApi.total({
      payment_id: Number(order.mp_payment_id),
    });

    console.log(`Refund issued for order ${orderId}, MP payment ${order.mp_payment_id}:`, refundResult.id);

    // Update order status to reembolsado
    const { error: updateError } = await supabase
      .from("pedidos")
      .update({ status: "reembolsado" })
      .eq("id", orderId);

    if (updateError) {
      console.error("Error updating order status after refund:", updateError);
      return res.status(500).json({ error: "Reembolso processado, mas erro ao atualizar status do pedido" });
    }

    return res.status(200).json({
      success: true,
      refundId: refundResult.id,
      message: "Reembolso processado com sucesso",
    });
  } catch (error: unknown) {
    console.error("Refund error:", error);
    return res.status(500).json({
      error: "Erro ao processar reembolso",
    });
  }
}
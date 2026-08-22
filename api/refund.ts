import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MercadoPagoConfig, PaymentRefund } from "mercadopago";
import { createClient } from "@supabase/supabase-js";
import { bearerToken, isAdminToken } from "../server/lib/security.js";

const mpAccessToken = process.env.MP_ACCESS_TOKEN;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const mpClient = mpAccessToken
  ? new MercadoPagoConfig({
      accessToken: mpAccessToken,
      options: { timeout: 5000 },
    })
  : null;

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!mpClient || !supabase) {
    return res.status(500).json({ error: "Serviço indisponível." });
  }

  try {
    if (!await isAdminToken(supabase, bearerToken(req.headers.authorization))) {
      return res.status(403).json({ error: "Forbidden: admin role required" });
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

    const { error: finalizeError } = await supabase.rpc("finalize_order_admin", {
      p_order_id: orderId,
      p_status: "reembolsado",
    });

    if (finalizeError) {
      console.error("Error finalizing order after refund:", finalizeError);
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

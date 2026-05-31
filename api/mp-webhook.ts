import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  options: { timeout: 5000 },
});

// Warn if service role key is missing
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.warn("[mp-webhook] SUPABASE_SERVICE_ROLE_KEY not set — order updates may fail due to RLS");
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
    // Verify MP webhook signature
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;
    const xSignature = req.headers["x-signature"] as string | undefined;

    if (!webhookSecret) {
      // FAIL CLOSED: reject webhooks if secret isn't configured in production
      console.error("MP_WEBHOOK_SECRET not configured — rejecting webhook");
      return res.status(500).send("Webhook secret not configured");
    }

    if (!xSignature) {
      console.error("Missing x-signature header");
      return res.status(401).send("Unauthorized");
    }

    // Parse x-signature header: "ts=...,v1=..."
    const parts = xSignature.split(",");
    let ts = "";
    let hash = "";
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key?.trim() === "ts") ts = value?.trim() ?? "";
      if (key?.trim() === "v1") hash = value?.trim() ?? "";
    }

    if (!ts || !hash) {
      console.error("Malformed x-signature header");
      return res.status(401).send("Unauthorized");
    }

    // Build manifest per MP spec: "id:{data.id};request-id:{x-request-id};ts:{ts};"
    const body = req.body as {
      type?: string;
      action?: string;
      data?: { id: string };
    };
    const xRequestId = req.headers["x-request-id"] as string | undefined;
    const dataId = body?.data?.id ?? "";
    const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;
    const expectedHash = createHmac("sha256", webhookSecret).update(manifest).digest("hex");

    // Constant-time comparison to prevent timing attacks
    try {
      const hashBuf = Buffer.from(hash, 'hex');
      const expectedBuf = Buffer.from(expectedHash, 'hex');
      if (hashBuf.length !== expectedBuf.length || !timingSafeEqual(hashBuf, expectedBuf)) {
        console.error("Webhook signature verification failed");
        return res.status(401).send("Unauthorized");
      }
    } catch {
      console.error("Webhook signature comparison error");
      return res.status(401).send("Unauthorized");
    }

    console.log("Webhook received:", JSON.stringify(body));

    // Mercado Pago sends notifications with type="payment" or action="payment.updated"
    const isPayment = body.type === "payment" || body.action?.startsWith("payment");

    if (isPayment && body.data?.id) {
      const paymentId = body.data.id;

      console.log(`Processing payment ${paymentId}`);

      // Fetch payment details from Mercado Pago
      const paymentApi = new Payment(mpClient);
      const paymentInfo = await paymentApi.get({ id: paymentId });

      const externalReference = paymentInfo.external_reference;
      const status = paymentInfo.status;
      const paymentMethod = paymentInfo.payment_method_id;

      console.log(`Payment ${paymentId}: status=${status}, ref=${externalReference}, method=${paymentMethod}`);

      if (externalReference) {
        // Map MP status to our status
        // Flow: pendente → pago → enviado_fornecedor → em_producao → a_caminho → em_estoque → em_entrega → entregue
        // Flow: pendente → cancelado
        // Flow: pago → reembolsado
        let orderStatus: string;
        switch (status) {
          case "approved":
            orderStatus = "pago";
            break;
          case "in_process":
          case "in_mediation":
            // mantém pendente — não usamos mais "em_analise"
            orderStatus = "pendente";
            break;
          case "cancelled":
          case "rejected":
            orderStatus = "cancelado";
            break;
          case "refunded":
          case "charged_back":
            orderStatus = "reembolsado";
            break;
          default:
            // pending, etc. — keep as pendente
            orderStatus = "pendente";
        }

        // Update order in Supabase
        const updateData: Record<string, unknown> = {
          status: orderStatus,
          mp_payment_id: String(paymentId),
        };
        if (paymentMethod) updateData.payment_method = paymentMethod;

        const { error } = await supabase
          .from("pedidos")
          .update(updateData)
          .eq("id", externalReference);

        if (error) {
          console.error("Error updating order:", error);
        } else {
          console.log(`Order ${externalReference} updated to ${orderStatus}`);
        }
      } else {
        console.log(`Payment ${paymentId}: no external_reference found`);
      }
    }

    // Always return 200 to acknowledge receipt
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    // Still return 200 to prevent retries
    return res.status(200).send("OK");
  }
}
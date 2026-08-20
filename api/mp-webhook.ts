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
  console.error("[mp-webhook] SUPABASE_SERVICE_ROLE_KEY not configured");
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  serviceRoleKey!
);

/** Map MP payment_type_id to our internal payment method values.
 *  MP sends specific method IDs like "visa", "master" in payment_method_id,
 *  but our frontend expects "pix", "credit_card", or "debit_card".
 *  payment_type_id gives us the category which maps directly. */
function mapPaymentType(mpType: string | undefined): string | undefined {
  if (!mpType) return undefined;
  switch (mpType) {
    case "credit_card":
      return "credit_card";
    case "debit_card":
      return "debit_card";
    case "bank_transfer":
      return "pix"; // Pix via bank transfer (Pix in Brazil)
    case "ticket":
      return "pix"; // Boleto — mapped to Pix since we don't distinguish payment methods for reporting
    case "prepaid_card":
      return "credit_card";
    default:
      return undefined; // Don't overwrite if we can't map
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Signature verification ──
  const webhookSecret = process.env.MP_WEBHOOK_SECRET;
  const xSignature = req.headers["x-signature"] as string | undefined;

  if (!webhookSecret) {
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

  const timestampValue = Number(ts);
  const timestampMs = timestampValue > 1e12 ? timestampValue : timestampValue * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    console.error("Expired webhook signature");
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

  // ── Payment processing ──
  // Mercado Pago sends notifications with type="payment" or action="payment.updated"
  const isPayment = body.type === "payment" || body.action?.startsWith("payment");

  if (!isPayment || !body.data?.id) {
    // Not a payment notification — acknowledge and move on
    return res.status(200).send("OK");
  }

  const paymentId = body.data.id;
  console.log(`Processing payment ${paymentId}`);

  // Fetch payment details from Mercado Pago
  let paymentInfo;
  try {
    const paymentApi = new Payment(mpClient);
    paymentInfo = await paymentApi.get({ id: paymentId });
  } catch (mpError) {
    console.error(`Error fetching payment ${paymentId} from MP:`, mpError);
    // Return 500 so MP retries the notification
    return res.status(500).send("Error fetching payment details");
  }

  const externalReference = paymentInfo.external_reference;
  const status = paymentInfo.status;
  const paymentType = paymentInfo.payment_type_id;

  console.log(`Payment ${paymentId}: status=${status}, ref=${externalReference}, type=${paymentType}`);

  if (!externalReference) {
    console.log(`Payment ${paymentId}: no external_reference found — skipping`);
    return res.status(200).send("OK");
  }

  if (!/^UL-[A-Z2-9]{8}$/.test(externalReference)) return res.status(200).send("OK");

  const { data: existingOrder, error: orderLookupError } = await supabase
    .from("pedidos")
    .select("id,total")
    .eq("id", externalReference)
    .maybeSingle();
  if (orderLookupError) return res.status(500).send("Error loading order");
  if (!existingOrder) return res.status(200).send("OK");

  const paidAmount = Number(paymentInfo.transaction_amount);
  const expectedAmount = Number(existingOrder.total);
  if (paymentInfo.currency_id !== "BRL" || !Number.isFinite(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.009) {
    console.error(`Payment ${paymentId}: amount or currency mismatch`);
    return res.status(200).send("OK");
  }

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
  const mappedPaymentMethod = mapPaymentType(paymentType);
  if (mappedPaymentMethod) {
    updateData.payment_method = mappedPaymentMethod;
  }

  const releaseDate = paymentInfo.money_release_date as string | undefined;
  const dateApproved = paymentInfo.date_approved as string | undefined;
  if (releaseDate && dateApproved && paymentType === "credit_card") {
    const diffMs = new Date(releaseDate).getTime() - new Date(dateApproved).getTime();
    const dias = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (dias <= 1) updateData.credit_release_period = "immediate";
    else if (dias <= 14) updateData.credit_release_period = "14_days";
    else updateData.credit_release_period = "30_days";
  }

  const { data, error } = await supabase
    .from("pedidos")
    .update(updateData)
    .eq("id", externalReference)
    .select("id");

  if (error) {
    // Status transition violations are permanent — order already advanced past this status
    if (error.message?.includes("Invalid status transition")) {
      console.log(`Order ${externalReference}: transition to ${orderStatus} not allowed — likely already advanced, skipping`);
      return res.status(200).send("OK");
    }
    console.error(`Error updating order ${externalReference}:`, error);
    // Return 500 so MP retries the notification for transient errors (network, RLS, etc.)
    return res.status(500).send("Error updating order");
  }

  if (!data || data.length === 0) {
    console.warn(`Order ${externalReference} not found — payment ${paymentId} has no matching order`);
  } else {
    console.log(`Order ${externalReference} updated to ${orderStatus}`);

    if (orderStatus === "pago" || orderStatus === "cancelado") {
      try {
        const { error: couponError } = await supabase.rpc("finalizar_uso_cupom", {
          p_pedido_id: externalReference,
          p_status: orderStatus === "pago" ? "confirmado" : "liberado",
        });
        const errorMessage = couponError?.message ?? "";
        const isMissingUsage = /(?:utiliza(?:ção|cao)|usage).*?(?:encontrad|not found)/i.test(errorMessage);
        if (couponError && !isMissingUsage) {
          console.warn("[mp-webhook] failed to finalize coupon reservation");
        }
      } catch {
        console.warn("[mp-webhook] failed to finalize coupon reservation");
      }
    }
  }

  // Restore pronta-entrega stock transactionally and only once.
  if (orderStatus === "cancelado" || orderStatus === "reembolsado") {
    const { error: stockError } = await supabase.rpc("restore_order_stock_once", { p_order_id: externalReference });
    if (stockError) console.error(`Error restoring stock for order ${externalReference}`);
  }

  return res.status(200).send("OK");
}

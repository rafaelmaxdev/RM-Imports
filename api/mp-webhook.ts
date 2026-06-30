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
  }

  // Update stock for pronta_entrega orders
  // Stock is deducted at order creation time, so on "pago" we do nothing.
  // On cancel/reject/refund we restore stock.
  if (orderStatus === "cancelado" || orderStatus === "reembolsado") {
    try {
      const { data: fullOrder } = await supabase
        .from("pedidos")
        .select("itens, pronta_entrega")
        .eq("id", externalReference)
        .single();

      if (fullOrder?.pronta_entrega && fullOrder.itens) {
        const itens = typeof fullOrder.itens === "string" ? JSON.parse(fullOrder.itens) : fullOrder.itens;

        for (const item of itens) {
          const { data: produtos } = await supabase
            .from("produtos")
            .select("id")
            .eq("nome", item.nome)
            .limit(1);

          if (!produtos || produtos.length === 0) continue;

          const produtoId = produtos[0].id;
          const isPersonalizado = item.personalizado ?? false;
          const nomePessoal = isPersonalizado ? (item.nomePersonalizado ?? null) : null;
          const numeroPessoal = isPersonalizado ? (item.numeroPersonalizado ?? null) : null;
          const isFeminino = item.feminino ?? false;

          let query = supabase
            .from("estoque_pronta_entrega")
            .select("id, quantidade")
            .eq("produto_id", produtoId)
            .eq("tamanho", item.tamanho)
            .eq("personalizado", isPersonalizado)
            .eq("feminino", isFeminino);

          if (nomePessoal) {
            query = query.eq("nome_personalizado", nomePessoal);
          } else {
            query = query.is("nome_personalizado", null);
          }
          if (numeroPessoal) {
            query = query.eq("numero_personalizado", numeroPessoal);
          } else {
            query = query.is("numero_personalizado", null);
          }

          const { data: existing } = await query.maybeSingle();

          // Restore to stock on cancel/refund
          if (existing) {
            await supabase
              .from("estoque_pronta_entrega")
              .update({ quantidade: existing.quantidade + 1 })
              .eq("id", existing.id);
          } else {
            await supabase
              .from("estoque_pronta_entrega")
              .insert({
                produto_id: produtoId,
                tamanho: item.tamanho,
                quantidade: 1,
                personalizado: isPersonalizado,
                nome_personalizado: nomePessoal,
                numero_personalizado: numeroPessoal,
                feminino: isFeminino,
              });
          }
        }
      }
    } catch (stockError) {
      console.error(`Error updating stock for order ${externalReference}:`, stockError);
    }
  }

  return res.status(200).send("OK");
}
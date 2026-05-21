import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createClient } from "@supabase/supabase-js";

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  options: { timeout: 5000 },
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body as {
      type?: string;
      action?: string;
      data?: { id: string };
    };

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
        // Flow: pendente → pago → entregue / cancelado
        let orderStatus: string;
        switch (status) {
          case "approved":
            orderStatus = "pago";
            break;
          case "cancelled":
          case "rejected":
            orderStatus = "cancelado";
            break;
          default:
            // pending, in_process, etc. — keep as pendente
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
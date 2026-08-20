import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { createClient } from "@supabase/supabase-js";
import {
  bearerToken,
  clientIp,
  consumeRateLimit,
  isAdminToken,
  verifyOrderAccessToken,
} from "../server/lib/security.js";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  options: { timeout: 5000 },
});

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error("[create-preference] SUPABASE_SERVICE_ROLE_KEY not configured");
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  serviceRoleKey!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = clientIp(req.headers, req.socket.remoteAddress);
  if (!await consumeRateLimit(supabase, "preference", ip, 10, 60)) {
    return res.status(429).json({ error: "Muitas requisições. Aguarde um momento." });
  }

  try {
    const body = req.body as { orderId?: unknown; orderAccessToken?: unknown } | null;
    const orderId = body?.orderId;
    if (typeof orderId !== "string" || !/^UL-[A-Z2-9]{8}$/.test(orderId)) {
      console.error("Missing orderId");
      return res.status(400).json({ error: "Invalid orderId" });
    }

    const admin = await isAdminToken(supabase, bearerToken(req.headers.authorization));
    if (!admin && !verifyOrderAccessToken(orderId, body?.orderAccessToken, serviceRoleKey!)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify order exists and is pending
    const { data: order, error: orderError } = await supabase
      .from("pedidos")
      .select("id, status, total, payment_method, mp_preference_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      console.error("Order not found:", orderId, orderError);
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "pendente") {
      console.error("Order not pending:", orderId, order.status);
      return res.status(400).json({ error: "Order is not pending" });
    }

    if (order.mp_preference_id) {
      return res.status(200).json({
        preferenceId: order.mp_preference_id,
        initPoint: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${order.mp_preference_id}`,
      });
    }

    const paymentMethod = order.payment_method;
    if (paymentMethod !== "pix" && paymentMethod !== "credit_card" && paymentMethod !== "debit_card") {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    const total = Number(order.total);
    if (!Number.isFinite(total) || total < 1 || total > 2000) {
      console.error("Invalid order total:", orderId, order.total);
      return res.status(400).json({ error: "Invalid order total" });
    }

    const preference = new Preference(client);

    // Configure payment methods based on the method saved on the order
    const paymentMethods: {
      installments: number;
      excluded_payment_methods?: { id: string }[];
      excluded_payment_types?: { id: string }[];
    } = {
      installments: 12,
    };

    if (paymentMethod === "pix") {
      // Pix only — exclude credit and debit cards
      paymentMethods.excluded_payment_methods = [
        { id: "visa" }, { id: "master" }, { id: "amex" }, { id: "elo" },
        { id: "hipercard" }, { id: "diners" }, { id: "discover" },
      ];
      paymentMethods.excluded_payment_types = [
        { id: "credit_card" }, { id: "debit_card" }, { id: "prepaid_card" },
      ];
    } else if (paymentMethod === "credit_card") {
      // Credit card only — exclude pix and debit
      paymentMethods.excluded_payment_types = [
        { id: "ticket" }, { id: "debit_card" }, { id: "prepaid_card" },
      ];
    } else if (paymentMethod === "debit_card") {
      // Debit card only — exclude pix and credit
      paymentMethods.excluded_payment_types = [
        { id: "ticket" }, { id: "credit_card" }, { id: "prepaid_card" },
      ];
    }

    const baseUrl = process.env.VITE_APP_URL || "https://rm-imports.vercel.app";
    const orderUrl = `${baseUrl}/pedido/${orderId}`;

    const result = await preference.create({
      body: {
        items: [{
          id: orderId,
          title: `Pedido ${orderId}`,
          quantity: 1,
          unit_price: total,
          currency_id: "BRL",
        }],
        external_reference: orderId,
        back_urls: {
          success: orderUrl,
          failure: orderUrl,
          pending: orderUrl,
        },
        auto_return: "approved",
        notification_url: `${baseUrl}/api/mp-webhook`,
        payment_methods: paymentMethods,
        expires: true,
        date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      requestOptions: { idempotencyKey: `preference-${orderId}` },
    });

    // Persist preference ID to the order (idempotent — only sets if not already set)
    const { error: updateError } = await supabase
      .from("pedidos")
      .update({ mp_preference_id: result.id })
      .eq("id", orderId)
      .is("mp_preference_id", null); // only update if not already set

    if (updateError) {
      console.warn("Failed to update order with preference ID (non-fatal):", updateError.message);
    }

    return res.status(200).json({
      preferenceId: result.id,
      initPoint: result.init_point,
    });
  } catch (error: unknown) {
    console.error("Error creating preference:", error);
    return res.status(500).json({
      error: "Failed to create preference",
    });
  }
}

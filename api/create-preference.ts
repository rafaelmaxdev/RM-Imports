import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { createClient } from "@supabase/supabase-js";

const client = new MercadoPagoConfig({
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
    const { items, orderId, payerEmail, payerName, paymentMethod } = req.body as {
      items: Array<{ title: string; quantity: number; unit_price: number }>;
      orderId: string;
      payerEmail?: string;
      payerName?: string;
      paymentMethod?: string;
    };

    console.log("create-preference request:", { orderId, itemsCount: items?.length, items: JSON.stringify(items) });

    if (!items || !orderId) {
      console.error("Missing items or orderId:", { items: !!items, orderId: !!orderId });
      return res.status(400).json({ error: "Missing items or orderId" });
    }

    // Validate prices are within safe range (prevents price manipulation)
    // Min R$1 (Mercado Pago minimum) / Max R$2.000 (covers any combo + extras)
    for (const item of items) {
      if (!Number.isFinite(item.unit_price) || item.unit_price < 1 || item.unit_price > 2000) {
        console.error("Invalid item price:", item.title, item.unit_price);
        return res.status(400).json({ error: `Invalid item price: ${item.title} - R$${item.unit_price}` });
      }
    }

    // Verify order exists and is pending
    const { data: order, error: orderError } = await supabase
      .from("pedidos")
      .select("id, status, total")
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

    const itemsTotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    console.log("Total check:", { itemsTotal, orderTotal: order.total, diff: Math.abs(itemsTotal - order.total) });
    if (Math.abs(itemsTotal - order.total) > 1) {
      console.error("Total mismatch:", { itemsTotal, orderTotal: order.total });
      return res.status(400).json({ error: `Total mismatch: items R$${itemsTotal.toFixed(2)} vs order R$${order.total.toFixed(2)}` });
    }

    const preference = new Preference(client);

    // Configure payment methods based on user's choice
    const paymentMethods: any = {
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

    const result = await preference.create({
      body: {
        items: items.map((item, index) => ({
          id: String(index + 1),
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency_id: "BRL",
        })),
        external_reference: orderId,
        payer: payerEmail
          ? {
              email: payerEmail,
              name: payerName?.split(" ")[0] || "",
              surname: payerName?.split(" ").slice(1).join(" ") || "",
            }
          : undefined,
        back_urls: {
          success: `${process.env.VITE_APP_URL || "https://rm-imports.vercel.app"}/pedido/${orderId}`,
          failure: `${process.env.VITE_APP_URL || "https://rm-imports.vercel.app"}/pedido/${orderId}`,
          pending: `${process.env.VITE_APP_URL || "https://rm-imports.vercel.app"}/pedido/${orderId}`,
        },
        auto_return: "approved",
        notification_url: `${process.env.VITE_APP_URL || "https://rm-imports.vercel.app"}/api/mp-webhook`,
        payment_methods: paymentMethods,
        expires: true,
        date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      } as any,
    });

    return res.status(200).json({
      preferenceId: result.id,
      initPoint: result.init_point,
    });
  } catch (error: any) {
    console.error("Error creating preference:", error);
    return res.status(500).json({
      error: "Failed to create preference",
      details: error.message || String(error),
    });
  }
}
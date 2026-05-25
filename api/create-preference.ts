import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MercadoPagoConfig, Preference } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  options: { timeout: 5000 },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { items, orderId, payerEmail, payerName } = req.body as {
      items: Array<{ title: string; quantity: number; unit_price: number }>;
      orderId: string;
      payerEmail?: string;
      payerName?: string;
    };

    if (!items || !orderId) {
      return res.status(400).json({ error: "Missing items or orderId" });
    }

    // Validate prices are within reasonable range
    for (const item of items) {
      if (item.unit_price < 50 || item.unit_price > 500) {
        return res.status(400).json({ error: "Invalid item price" });
      }
    }

    const preference = new Preference(client);

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
        payment_methods: {
          installments: 12,
        },
        
      },
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
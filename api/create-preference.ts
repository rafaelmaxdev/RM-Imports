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
import { buildMercadoPagoPreferenceContext, normalizeMPDeviceId } from "../server/lib/mp-preference-context.js";

const mpAccessToken = process.env.MP_ACCESS_TOKEN;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.VITE_APP_URL;

const client = mpAccessToken
  ? new MercadoPagoConfig({
      accessToken: mpAccessToken,
      options: { timeout: 5000 },
    })
  : null;

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

const defaultBaseUrl = "https://rm-imports.vercel.app";
const baseUrl = (() => {
  if (!appUrl) return defaultBaseUrl;
  try {
    const url = new URL(appUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : defaultBaseUrl;
  } catch {
    return defaultBaseUrl;
  }
})();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!client || !supabase || !serviceRoleKey) {
    return res.status(500).json({ error: "Serviço indisponível." });
  }

  const ip = clientIp(req.headers, req.socket.remoteAddress);
  if (!await consumeRateLimit(supabase, "preference", ip, 10, 60)) {
    return res.status(429).json({ error: "Muitas requisições. Aguarde um momento." });
  }

  try {
    const body = req.body as { orderId?: unknown; orderAccessToken?: unknown; deviceId?: unknown } | null;
    const orderId = body?.orderId;
    const deviceId = normalizeMPDeviceId(body?.deviceId);
    if (typeof orderId !== "string" || !/^UL-[A-Z2-9]{8}$/.test(orderId)) {
      console.error("Missing orderId");
      return res.status(400).json({ error: "Invalid orderId" });
    }

    const admin = await isAdminToken(supabase, bearerToken(req.headers.authorization));
    if (!admin && !verifyOrderAccessToken(orderId, body?.orderAccessToken, serviceRoleKey)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify order exists and is pending
    const { data: order, error: orderError } = await supabase
      .from("pedidos")
      .select("id, status, total, payment_method, mp_preference_id, itens, endereco")
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
      console.info(JSON.stringify({
        event: "mp_preference_device_diagnostic",
        timestamp: new Date().toISOString(),
        orderId,
        phase: "reused",
        deviceIdRecebido: typeof body?.deviceId === "string" && body.deviceId.length > 0,
        deviceIdValido: Boolean(deviceId),
        deviceIdEnviadoAoSDK: false,
        preferenceId: order.mp_preference_id,
      }));
      return res.status(200).json({
        preferenceId: order.mp_preference_id,
        initPoint: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${order.mp_preference_id}`,
      });
    }

    let privateBuyer: unknown;
    try {
      const { data, error } = await supabase
        .from("pedido_payment_buyers")
        .select("email,cpf")
        .eq("pedido_id", orderId)
        .maybeSingle();

      const errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
      if (error) {
        if (errorCode === "42P01" || errorCode === "PGRST205") {
          console.warn("private payment buyer storage unavailable");
        } else {
          console.error("private payment buyer storage failure");
          return res.status(500).json({ error: "Não foi possível carregar os dados do pagamento." });
        }
      } else {
        privateBuyer = data ?? undefined;
      }
    } catch (error: unknown) {
      const errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
      if (errorCode === "42P01" || errorCode === "PGRST205") {
        console.warn("private payment buyer storage unavailable");
      } else {
        console.error("private payment buyer storage failure");
        return res.status(500).json({ error: "Não foi possível carregar os dados do pagamento." });
      }
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

    const orderUrl = `${baseUrl}/pedido/${orderId}`;
    const context = buildMercadoPagoPreferenceContext({
      orderId,
      itens: order.itens,
      endereco: order.endereco,
      buyer: privateBuyer,
    });

    const requestOptions = {
      idempotencyKey: `preference-${orderId}`,
      ...(deviceId ? { meliSessionId: deviceId } : {}),
    };

    console.info(JSON.stringify({
      event: "mp_preference_device_diagnostic",
      timestamp: new Date().toISOString(),
      orderId,
      phase: "create_requested",
      deviceIdRecebido: typeof body?.deviceId === "string" && body.deviceId.length > 0,
      deviceIdValido: Boolean(deviceId),
      deviceIdEnviadoAoSDK: Boolean(requestOptions.meliSessionId),
    }));

    const result = await preference.create({
      body: {
        items: [{
          id: orderId,
          ...context.item,
          quantity: 1,
          unit_price: total,
          currency_id: "BRL",
        }],
        ...(context.payer ? { payer: context.payer } : {}),
        external_reference: orderId,
        back_urls: {
          success: orderUrl,
          failure: orderUrl,
          pending: orderUrl,
        },
        auto_return: "approved",
        notification_url: `${baseUrl}/api/mp-webhook`,
        payment_methods: paymentMethods,
        statement_descriptor: "RM IMPORTS",
        expires: true,
        date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      requestOptions,
    });

    console.info(JSON.stringify({
      event: "mp_preference_device_diagnostic",
      timestamp: new Date().toISOString(),
      orderId,
      phase: "created",
      deviceIdRecebido: typeof body?.deviceId === "string" && body.deviceId.length > 0,
      deviceIdValido: Boolean(deviceId),
      deviceIdEnviadoAoSDK: Boolean(requestOptions.meliSessionId),
      preferenceId: result.id,
    }));

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
  } catch {
    console.error("Error creating preference");
    return res.status(500).json({
      error: "Failed to create preference",
    });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import {
  calculateServerItemPrice,
  INVALID_PRODUCT_VARIANT_MESSAGE,
  limitarDescontoCupom,
  normalizeBrazilPhone,
  type ServerCheckoutConfig,
  type ServerProductPricing,
  validateProductVariant,
} from "../server/lib/checkout.js";
import { clientIp, consumeRateLimit, createOrderAccessToken } from "../server/lib/security.js";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

type JsonObject = Record<string, unknown>;

class ValidationError extends Error {}

const COUPON_ERROR = "Cupom inválido, expirado, já utilizado ou limite atingido.";
const SIZES = new Set(["P", "M", "G", "GG", "G1", "G2", "G3"]);

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new ValidationError(`${field} inválido.`);
  const result = value.trim();
  if (!result || result.length > maxLength) throw new ValidationError(`${field} inválido.`);
  return result;
}

function optionalText(value: unknown, field: string, maxLength: number): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new ValidationError(`${field} inválido.`);
  const result = value.trim();
  if (result.length > maxLength) throw new ValidationError(`${field} inválido.`);
  return result;
}

function validateAddress(value: unknown): { address: JsonObject; phone: string } {
  if (!isObject(value)) throw new ValidationError("Endereço inválido.");

  const nome = text(value.nome, "Nome", 100);
  const telefoneRaw = text(value.telefone, "Telefone", 30);
  let telefone: string;
  try {
    telefone = normalizeBrazilPhone(telefoneRaw);
  } catch {
    throw new ValidationError("Telefone inválido.");
  }

  const deliveryMethod = value.deliveryMethod;
  if (deliveryMethod !== "entrega" && deliveryMethod !== "retirada") {
    throw new ValidationError("Forma de entrega inválida.");
  }

  const rua = optionalText(value.rua, "Rua", 150);
  const numero = optionalText(value.numero, "Número", 20);
  const complemento = optionalText(value.complemento, "Complemento", 100);
  const bairro = optionalText(value.bairro, "Bairro", 100);
  const cidade = optionalText(value.cidade, "Cidade", 80);
  const estado = optionalText(value.estado, "Estado", 20).toUpperCase();
  const cep = optionalText(value.cep, "CEP", 12);

  if (deliveryMethod === "entrega") {
    if (!rua || !numero || !bairro || !cidade || !estado || !cep) {
      throw new ValidationError("Preencha os campos de entrega.");
    }
    if (cidade.toLocaleLowerCase("pt-BR") !== "bezerros" || estado !== "PE") {
      throw new ValidationError("Entrega disponível apenas para Bezerros-PE.");
    }
    if (cep.replace(/\D/g, "").length !== 8) {
      throw new ValidationError("CEP inválido.");
    }
  }

  return {
    address: {
      nome,
      rua,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      telefone,
      deliveryMethod,
    },
    phone: telefone,
  };
}

interface ValidatedItem {
  productId: string;
  tamanho: string;
  genero: "Masculino" | "Feminino";
  personalizado: boolean;
  nomePersonalizado?: string;
  numeroPersonalizado?: string;
  prontaEntrega: boolean;
}

function validateItems(value: unknown): ValidatedItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new ValidationError("O carrinho deve ter entre 1 e 20 itens.");
  }

  return value.map((rawItem, index) => {
    if (!isObject(rawItem)) throw new ValidationError(`Item ${index + 1} inválido.`);

    const productId = text(rawItem.productId, "Produto", 100);
    const tamanho = text(rawItem.tamanho, "Tamanho", 4);
    if (!SIZES.has(tamanho)) throw new ValidationError("Tamanho inválido.");

    const genero = rawItem.genero;
    if (genero !== "Masculino" && genero !== "Feminino") {
      throw new ValidationError("Modelo inválido.");
    }

    if (typeof rawItem.personalizado !== "boolean") {
      throw new ValidationError("Personalização inválida.");
    }
    const personalizado = rawItem.personalizado;
    const prontaEntrega = rawItem.prontaEntrega === undefined ? false : rawItem.prontaEntrega;
    if (typeof prontaEntrega !== "boolean") throw new ValidationError("Pronta entrega inválida.");

    if (!personalizado) {
      return { productId, tamanho, genero, personalizado, prontaEntrega };
    }

    const nomePersonalizado = text(rawItem.nomePersonalizado, "Nome personalizado", 40);
    const numeroPersonalizado = text(rawItem.numeroPersonalizado, "Número personalizado", 4);
    if (!/^\d{1,4}$/.test(numeroPersonalizado)) {
      throw new ValidationError("Número personalizado inválido.");
    }

    return {
      productId,
      tamanho,
      genero,
      personalizado,
      nomePersonalizado,
      numeroPersonalizado,
      prontaEntrega,
    };
  });
}

function asNumberRecord(value: unknown): Record<string, number> | null {
  return isObject(value) ? value as Record<string, number> : null;
}

function asBooleanRecord(value: unknown): Record<string, boolean> | null {
  return isObject(value) ? value as Record<string, boolean> : null;
}

function buildConfig(rows: unknown): ServerCheckoutConfig {
  const config: ServerCheckoutConfig = {
    precos_base: {},
    precos_promocao: {},
    promocao_ativa: {},
    promocoes_time: {},
    desconto_global: null,
    pronta_entrega_markup: 20,
    ano_temporada_lancamento: 2026,
    desconto_temporada_anterior: {
      Torcedor: 6.671,
      Jogador: 5.266,
      Retrô: 0,
      "Manga Longa Torcedor": 0,
      "Manga Longa Jogador": 0,
      "Manga Longa Retrô": 0,
      Goleiro: 0,
      Treinamento: 0,
      Polo: 0,
      NBA: 0,
    },
  };

  if (!Array.isArray(rows)) return config;

  for (const rawRow of rows) {
    if (!isObject(rawRow) || typeof rawRow.key !== "string") continue;
    switch (rawRow.key) {
      case "precos_base":
        config.precos_base = asNumberRecord(rawRow.value) ?? config.precos_base;
        break;
      case "precos_promocao":
        config.precos_promocao = asNumberRecord(rawRow.value) ?? config.precos_promocao;
        break;
      case "promocao_ativa":
        config.promocao_ativa = asBooleanRecord(rawRow.value) ?? config.promocao_ativa;
        break;
      case "promocoes_time":
        if (isObject(rawRow.value)) config.promocoes_time = rawRow.value as ServerCheckoutConfig["promocoes_time"];
        break;
      case "desconto_global":
        if (typeof rawRow.value === "number") config.desconto_global = rawRow.value;
        break;
      case "pronta_entrega_markup":
        if (typeof rawRow.value === "number") config.pronta_entrega_markup = rawRow.value;
        break;
      case "ano_temporada_lancamento":
        if (typeof rawRow.value === "number") config.ano_temporada_lancamento = rawRow.value;
        break;
      case "desconto_temporada_anterior":
        config.desconto_temporada_anterior = asNumberRecord(rawRow.value) ?? config.desconto_temporada_anterior;
        break;
    }
  }

  return config;
}

function isDuplicateError(error: unknown): boolean {
  if (!isObject(error)) return false;
  return error.code === "23505" || (typeof error.message === "string" && /duplicate|unique/i.test(error.message));
}

interface ProductRow extends ServerProductPricing {
  id: string;
  nome: string;
  temporada: string;
  yupoo_url: string | null;
  feminino: boolean;
}

interface CouponReservation {
  cupom_id: string | null;
  codigo: string;
  desconto: number;
  influenciador_handle: string | null;
  rev_share_percentual: number | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!supabase) return res.status(500).json({ error: "Serviço indisponível." });
  const ip = clientIp(req.headers, req.socket.remoteAddress);
  if (!await consumeRateLimit(supabase, "checkout", ip, 10, 60)) {
    return res.status(429).json({ error: "Muitas requisições. Aguarde um momento." });
  }

  let couponReserved = false;
  let orderIdForCleanup = "";
  const releaseCoupon = async () => {
    if (!couponReserved) return;
    couponReserved = false;
    try {
      const { error } = await supabase.rpc("finalizar_uso_cupom", {
        p_pedido_id: orderIdForCleanup,
        p_status: "liberado",
      });
      if (error) console.warn("[api/checkout] failed to release coupon reservation");
    } catch {
      console.warn("[api/checkout] failed to release coupon reservation");
    }
  };

  try {
    if (!isObject(req.body)) throw new ValidationError("Corpo inválido.");

    const orderId = text(req.body.orderId, "ID do pedido", 20);
    orderIdForCleanup = orderId;
    if (!/^UL-[A-Z2-9]{8}$/.test(orderId)) throw new ValidationError("ID do pedido inválido.");

    const paymentMethod = req.body.paymentMethod;
    if (paymentMethod !== "pix" && paymentMethod !== "credit_card" && paymentMethod !== "debit_card") {
      throw new ValidationError("Forma de pagamento inválida.");
    }

    const { address, phone } = validateAddress(req.body.address);
    const items = validateItems(req.body.items);
    let couponCode: string | null = null;
    if (req.body.couponCode !== undefined && req.body.couponCode !== null && req.body.couponCode !== "") {
      couponCode = text(req.body.couponCode, "Cupom", 50).toUpperCase();
    }

    const { data: existingOrder, error: existingOrderError } = await supabase
      .from("pedidos")
      .select("id")
      .eq("id", orderId)
      .maybeSingle();
    if (existingOrderError) {
      console.error("[api/checkout] failed to check order ID");
      return res.status(500).json({ error: "Não foi possível criar o pedido." });
    }
    if (existingOrder) return res.status(409).json({ error: "Este pedido já existe." });

    const productIds = [...new Set(items.map((item) => item.productId))];
    const [productsResult, configResult] = await Promise.all([
      supabase
        .from("produtos")
        .select("id,nome,time,tipo,temporada,yupoo_url,preco_customizado,promocao_tipo,promocao_valor,feminino")
        .in("id", productIds),
      supabase.from("loja_config").select("key,value"),
    ]);

    if (productsResult.error || configResult.error) {
      console.error("[api/checkout] failed to load checkout data");
      return res.status(500).json({ error: "Não foi possível calcular o pedido." });
    }

    const products = (productsResult.data ?? []) as ProductRow[];
    const productsById = new Map(products.map((product) => [String(product.id), product]));
    if (productIds.some((id) => !productsById.has(id))) {
      return res.status(400).json({ error: "Um ou mais produtos não estão disponíveis." });
    }

    const config = buildConfig(configResult.data);
    const orderItems = items.map((item) => {
      const product = productsById.get(item.productId)!;
      try {
        validateProductVariant(product, item);
      } catch {
        throw new ValidationError(INVALID_PRODUCT_VARIANT_MESSAGE);
      }
      const price = calculateServerItemPrice(product, item, config);
      const feminine = item.genero === "Feminino";
      const peMarkup = item.prontaEntrega ? config.pronta_entrega_markup ?? 0 : undefined;
      return {
        productId: product.id,
        nome: product.nome,
        tipo: product.tipo,
        temporada: product.temporada,
        tamanho: item.tamanho,
        genero: item.genero,
        personalizado: item.personalizado,
        ...(item.nomePersonalizado ? { nomePersonalizado: item.nomePersonalizado } : {}),
        ...(item.numeroPersonalizado ? { numeroPersonalizado: item.numeroPersonalizado } : {}),
        preco: price.preco,
        precoBase: price.precoBase,
        yupooUrl: product.yupoo_url ?? "",
        feminino: feminine,
        prontaEntrega: item.prontaEntrega,
        ...(peMarkup !== undefined ? { peMarkup } : {}),
      };
    });

    const subtotal = Math.round(orderItems.reduce((sum, item) => sum + item.preco, 0) * 100) / 100;
    const subtotalBase = Math.round(orderItems.reduce((sum, item) => sum + item.precoBase, 0) * 100) / 100;
    let coupon: CouponReservation | null = null;

    if (couponCode) {
      const { data: couponData, error: couponError } = await supabase.rpc("reservar_cupom", {
        p_cupom_codigo: couponCode,
        p_telefone_normalizado: phone,
        p_pedido_id: orderId,
        p_total: subtotal,
      });
      if (couponError) {
        console.warn("[api/checkout] coupon reservation rejected");
        return res.status(400).json({ error: COUPON_ERROR });
      }

      couponReserved = true;
      const rawCoupon = Array.isArray(couponData) ? couponData[0] : couponData;
      if (!isObject(rawCoupon) || typeof rawCoupon.desconto !== "number" || !Number.isFinite(rawCoupon.desconto)) {
        await releaseCoupon();
        return res.status(400).json({ error: COUPON_ERROR });
      }

      const descontoSolicitado = Math.round(rawCoupon.desconto * 100) / 100;
      if (descontoSolicitado < 0 || descontoSolicitado > subtotal) {
        await releaseCoupon();
        return res.status(400).json({ error: COUPON_ERROR });
      }
      const desconto = limitarDescontoCupom(descontoSolicitado, subtotal, subtotalBase);
      if (desconto <= 0) {
        await releaseCoupon();
        return res.status(400).json({ error: COUPON_ERROR });
      }
      coupon = {
        cupom_id: typeof rawCoupon.cupom_id === "string" ? rawCoupon.cupom_id : null,
        codigo: typeof rawCoupon.codigo === "string" ? rawCoupon.codigo : couponCode,
        desconto,
        influenciador_handle: typeof rawCoupon.influenciador_handle === "string" ? rawCoupon.influenciador_handle : null,
        rev_share_percentual: typeof rawCoupon.rev_share_percentual === "number" ? rawCoupon.rev_share_percentual : null,
      };
    }

    const total = Math.round((subtotal - (coupon?.desconto ?? 0)) * 100) / 100;
    if (coupon && total < 1) {
      await releaseCoupon();
      return res.status(400).json({ error: COUPON_ERROR });
    }
    const revShare = coupon?.rev_share_percentual ?? 0;
    const now = new Date();
    const row = {
      id: orderId,
      data: now.toLocaleDateString("pt-BR"),
      hora: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      itens: orderItems,
      total,
      status: "pendente",
      endereco: address,
      payment_method: paymentMethod,
      mp_preference_id: null,
      mp_payment_id: null,
      admin_order: false,
      pronta_entrega: orderItems.some((item) => item.prontaEntrega),
      reposicao: false,
      telefone_normalizado: phone,
      cupom_id: coupon?.cupom_id ?? null,
      cupom_codigo: coupon?.codigo ?? null,
      cupom_desconto: coupon?.desconto ?? null,
      influenciador_handle: coupon?.influenciador_handle ?? null,
      rev_share_percentual: coupon?.rev_share_percentual ?? null,
      valor_base_comissao: total,
      comissao_calculada: Math.round(total * revShare) / 100,
    };

    const { data: order, error: insertError } = await supabase
      .from("pedidos")
      .insert(row)
      .select()
      .single();
    if (insertError || !order) {
      await releaseCoupon();
      if (isDuplicateError(insertError)) return res.status(409).json({ error: "Este pedido já existe." });
      console.error("[api/checkout] failed to insert order");
      return res.status(500).json({ error: "Não foi possível criar o pedido." });
    }

    if (row.pronta_entrega) {
      const { error: stockError } = await supabase.rpc("reserve_order_stock", { p_order_id: order.id });
      if (stockError) {
        await releaseCoupon();
        await supabase.from("pedidos").delete().eq("id", order.id);
        return res.status(409).json({ error: "Um item de pronta entrega acabou de ficar indisponível." });
      }
    }

    return res.status(201).json({
      order,
      orderAccessToken: createOrderAccessToken(order.id, serviceRoleKey!),
    });
  } catch (error: unknown) {
    await releaseCoupon();
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error("[api/checkout] unexpected checkout error", error);
    return res.status(500).json({ error: "Não foi possível criar o pedido." });
  }
}

export interface ServerProductPricing {
  tipo: string;
  time?: string | null;
  preco_customizado?: number | null;
  promocao_tipo?: string | null;
  promocao_valor?: number | null;
}

export interface ServerProductVariantProduct {
  tipo: string;
  feminino: boolean;
}

export interface ServerProductVariantOptions {
  tamanho: string;
  genero: string;
  personalizado: boolean;
}

export interface ServerItemPricingOptions {
  tamanho: string;
  personalizado: boolean;
  prontaEntrega?: boolean;
}

export interface ServerTeamPromotion {
  tipo: string;
  valor?: number | null;
  preco?: number | null;
}

export interface ServerCheckoutConfig {
  precos_base?: Record<string, number>;
  precos_promocao?: Record<string, number>;
  promocao_ativa?: Record<string, boolean>;
  desconto_global?: number | null;
  promocoes_time?: Record<string, ServerTeamPromotion>;
  pronta_entrega_markup?: number | null;
}

const TAMANHOS = ["P", "M", "G", "GG", "G1", "G2", "G3"];
const TAMANHOS_FEMININA = ["P", "M", "G", "GG"];
const TAMANHOS_POR_TIPO: Record<string, string[]> = {
  Torcedor: ["P", "M", "G", "GG", "G1", "G2", "G3"],
  "Manga Longa Torcedor": ["P", "M", "G", "GG", "G1"],
  "Manga Longa Jogador": ["P", "M", "G", "GG", "G1", "G2", "G3"],
  "Manga Longa Retrô": ["P", "M", "G", "GG", "G1"],
  Goleiro: ["P", "M", "G", "GG", "G1"],
  Jogador: ["P", "M", "G", "GG", "G1", "G2", "G3"],
  Retrô: ["P", "M", "G", "GG", "G1"],
  Treinamento: ["P", "M", "G", "GG", "G1"],
  NBA: ["P", "M", "G", "GG", "G1", "G2"],
  Polo: ["P", "M", "G", "GG"],
};

export const INVALID_PRODUCT_VARIANT_MESSAGE = "Tamanho, modelo ou personalização indisponível para este produto.";

export function validateProductVariant(
  product: ServerProductVariantProduct,
  options: ServerProductVariantOptions,
): void {
  if (
    !product ||
    typeof product.tipo !== "string" ||
    typeof product.feminino !== "boolean" ||
    !options ||
    typeof options.tamanho !== "string" ||
    typeof options.genero !== "string" ||
    typeof options.personalizado !== "boolean"
  ) {
    throw new Error(INVALID_PRODUCT_VARIANT_MESSAGE);
  }

  const validGender = options.genero === "Masculino" || options.genero === "Feminino";
  const availableSizes = options.genero === "Feminino"
    ? product.feminino ? TAMANHOS_FEMININA : []
    : TAMANHOS_POR_TIPO[product.tipo] ?? TAMANHOS;

  if (
    !validGender ||
    !availableSizes.includes(options.tamanho) ||
    (product.tipo === "Polo" && options.personalizado)
  ) {
    throw new Error(INVALID_PRODUCT_VARIANT_MESSAGE);
  }
}

const VALID_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export function normalizeBrazilPhone(value: string): string {
  if (typeof value !== "string") throw new Error("Telefone inválido");

  const digits = value.replace(/\D/g, "");
  if (!digits) throw new Error("Telefone inválido");

  const normalized = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  const ddd = normalized.slice(2, 4);

  if (!/^55\d{2}\d{8,9}$/.test(normalized) || !VALID_DDDS.has(ddd)) {
    throw new Error("Telefone inválido");
  }

  return normalized;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function configuredPositiveNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function configuredMarkup(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isValidDiscountPercentage(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100;
}

export function calculateServerItemPrice(
  product: ServerProductPricing,
  options: ServerItemPricingOptions,
  config: ServerCheckoutConfig,
): { preco: number; precoBase: number } {
  const basePrice = configuredPositiveNumber(config.precos_base?.[product.tipo]) ?? 89.90;
  const customPrice = configuredPositiveNumber(product.preco_customizado);
  let unitPrice = basePrice;
  let priceBase = basePrice;
  let resolved = false;

  // Keep the same priority as getPrecoProduto: individual, custom, team,
  // category, then global promotion.
  if (product.promocao_tipo === "porcentagem" && isValidDiscountPercentage(product.promocao_valor)) {
    unitPrice = roundCents(basePrice - basePrice * (product.promocao_valor / 100));
    resolved = true;
  } else if (product.promocao_tipo === "novo_preco" && customPrice !== null) {
    unitPrice = customPrice;
    resolved = true;
  } else if (product.promocao_tipo === "leve_pague" || product.promocao_tipo === "leve_3_pague_2") {
    // The quantity-dependent discount is applied by the cart, not per unit.
    resolved = true;
  }

  if (!resolved && customPrice !== null) {
    if (customPrice < basePrice) {
      unitPrice = customPrice;
    } else {
      unitPrice = customPrice;
      priceBase = customPrice;
    }
    resolved = true;
  }

  const teamPromotion = product.time ? config.promocoes_time?.[product.time] : undefined;
  if (!resolved && teamPromotion?.tipo === "porcentagem" && isValidDiscountPercentage(teamPromotion.valor)) {
    unitPrice = roundCents(basePrice - basePrice * (teamPromotion.valor / 100));
    resolved = true;
  } else if (!resolved && teamPromotion?.tipo === "novo_preco") {
    const teamPrice = configuredPositiveNumber(teamPromotion.preco);
    if (teamPrice !== null) {
      unitPrice = teamPrice;
      resolved = true;
    }
  }

  if (!resolved && config.promocao_ativa?.[product.tipo]) {
    unitPrice = configuredPositiveNumber(config.precos_promocao?.[product.tipo]) ?? basePrice;
    resolved = true;
  }

  if (!resolved && isValidDiscountPercentage(config.desconto_global)) {
    unitPrice = roundCents(basePrice - basePrice * (config.desconto_global / 100));
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    unitPrice = basePrice;
  }

  const sizeMarkup = options.tamanho === "G2" ? 10 : options.tamanho === "G3" ? 20 : 0;
  const personalizationMarkup = options.personalizado ? (product.tipo === "Torcedor" ? 20 : 25) : 0;
  const peMarkup = options.prontaEntrega
    ? configuredMarkup(config.pronta_entrega_markup)
    : 0;
  const addOns = sizeMarkup + personalizationMarkup + peMarkup;
  const fallbackPrice = roundCents(89.90 + addOns);
  const price = roundCents(unitPrice + addOns);
  const basePriceWithAddOns = roundCents(priceBase + addOns);

  return {
    preco: Number.isFinite(price) && price > 0 ? price : fallbackPrice,
    precoBase: Number.isFinite(basePriceWithAddOns) && basePriceWithAddOns > 0 ? basePriceWithAddOns : fallbackPrice,
  };
}

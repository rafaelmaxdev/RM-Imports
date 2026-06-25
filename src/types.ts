export interface CartItem {
  productId: string;
  nome: string;
  imagemUrl: string;
  yupooUrl: string;
  tipo: string;
  temporada: string;
  tamanho: string;
  genero: string;
  personalizado: boolean;
  nomePersonalizado?: string;
  numeroPersonalizado?: string;
  preco: number;
  precoBase: number;       // Total price without any discount (base + add-ons)
  feminino: boolean;
  prontaEntrega?: boolean; // True when buying from stock (15% markup applied)
}

export interface OrderItem {
  nome: string;
  tipo: string;
  temporada: string;
  tamanho: string;
  genero: string;
  personalizado: boolean;
  nomePersonalizado?: string;
  numeroPersonalizado?: string;
  preco: number;
  precoBase?: number;      // Total price without any discount (base + add-ons); optional for backward compat
  yupooUrl: string;
  feminino: boolean;
}

export interface OrderAddress {
  nome: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  deliveryMethod: "entrega" | "retirada";
}

export type PaymentMethod = "pix" | "credit_card" | "debit_card";

export interface Order {
  id: string;
  data: string;
  hora: string;
  itens: OrderItem[];
  total: number;
  status: "pendente" | "pago" | "enviado_fornecedor" | "em_producao" | "a_caminho" | "em_estoque" | "em_entrega" | "entregue" | "cancelado" | "reembolsado";
  endereco?: OrderAddress;
  payment_method?: PaymentMethod;
  mp_preference_id?: string;
  mp_payment_id?: string;
  admin_order?: boolean;
  pronta_entrega?: boolean;
  credit_release_period?: "immediate" | "14_days" | "30_days";
}

export interface EstoqueItem {
  id: string;
  produto_id: string;
  tamanho: string;
  quantidade: number;
  personalizado: boolean;
  nome_personalizado?: string | null;
  numero_personalizado?: string | null;
  created_at: string;
  // Joined from produtos
  produto_nome?: string;
  produto_imagem?: string;
  produto_tipo?: string;
  produto_time?: string;
  produto_liga?: string;
  produto_temporada?: string;
}

export const PRECOS_BASE: Record<string, number> = {
  "Torcedor": 129.90,
  "Jogador": 169.90,
  "Retrô": 169.90,
  "Manga Longa Torcedor": 159.90,
  "Manga Longa Jogador": 169.90,
  "Manga Longa Retrô": 169.90,
  "Goleiro": 129.90,
  "Treinamento": 139.90,
  "Polo": 139.90,
  "NBA": 189.90,
};

export interface LojaConfig {
  precos_base: Record<string, number>;
  precos_promocao: Record<string, number>;
  promocao_ativa: Record<string, boolean>;
}

export const DEFAULT_CONFIG: LojaConfig = {
  precos_base: {
    "Torcedor": 129.90,
    "Jogador": 169.90,
    "Retrô": 169.90,
    "Manga Longa Torcedor": 159.90,
    "Manga Longa Jogador": 169.90,
    "Manga Longa Retrô": 169.90,
    "Goleiro": 129.90,
    "Treinamento": 139.90,
    "Polo": 139.90,
    "NBA": 189.90,
  },
  precos_promocao: {
    "Torcedor": 109.90,
    "Jogador": 139.90,
    "Retrô": 149.90,
    "Manga Longa Torcedor": 139.90,
    "Manga Longa Jogador": 149.90,
    "Manga Longa Retrô": 149.90,
    "Goleiro": 109.90,
    "Treinamento": 119.90,
    "Polo": 119.90,
    "NBA": 169.90,
  },
  promocao_ativa: {
    "Torcedor": false,
    "Jogador": false,
    "Retrô": false,
    "Manga Longa Torcedor": false,
    "Manga Longa Jogador": false,
    "Manga Longa Retrô": false,
    "Goleiro": false,
    "Treinamento": false,
    "Polo": false,
    "NBA": false,
  },
};

export const TIPOS_CATEGORIA = ["Torcedor", "Jogador", "Retrô", "Manga Longa Torcedor", "Manga Longa Jogador", "Manga Longa Retrô", "Goleiro", "Treinamento", "Polo", "NBA"] as const;

export type PromocaoTipo = "porcentagem" | "novo_preco" | "leve_pague" | "leve_3_pague_2" | null;

/** Tipos que NÃO permitem personalização (nome/número) */
export const TIPOS_SEM_PERSONALIZACAO = ["Polo"];

export interface PromocaoInfo {
  base: number;
  promo: number | null;
  emPromocao: boolean;
  promocaoTipo: PromocaoTipo;
  promocaoValor: number | null;
  badge: string | null;
  discountLabel: string | null;
}

export function getPrecoProduto(
  tipo: string,
  config: LojaConfig,
  precoCustomizado?: number | null,
  promocaoTipo?: PromocaoTipo,
  promocaoValor?: number | null,
): PromocaoInfo {
  const basePrice = config.precos_base[tipo] ?? 89.90;

  // Individual product promo takes priority — discount always based on base price
  if (promocaoTipo === "porcentagem" && promocaoValor) {
    const desconto = basePrice * (promocaoValor / 100);
    const promoPrice = Math.round((basePrice - desconto) * 100) / 100;
    return {
      base: basePrice,
      promo: promoPrice,
      emPromocao: true,
      promocaoTipo,
      promocaoValor,
      badge: "PROMO",
      discountLabel: `${promocaoValor}% OFF`,
    };
  }

  if (promocaoTipo === "novo_preco" && precoCustomizado != null) {
    const discountPercent = Math.round(((basePrice - precoCustomizado) / basePrice) * 100);
    return {
      base: basePrice,
      promo: precoCustomizado,
      emPromocao: true,
      promocaoTipo,
      promocaoValor: null,
      badge: "PROMO",
      discountLabel: `${discountPercent}% OFF`,
    };
  }

  if (promocaoTipo === "leve_pague") {
    return {
      base: basePrice,
      promo: null,
      emPromocao: true,
      promocaoTipo,
      promocaoValor: null,
      badge: "PROMO",
      discountLabel: "50% OFF",
    };
  }

  if (promocaoTipo === "leve_3_pague_2") {
    return {
      base: basePrice,
      promo: null,
      emPromocao: true,
      promocaoTipo,
      promocaoValor: null,
      badge: "PROMO",
      discountLabel: "33% OFF",
    };
  }

  // Custom price overrides category promotion — show as promo based on base price
  if (precoCustomizado != null && precoCustomizado < basePrice) {
    const discountPercent = Math.round(((basePrice - precoCustomizado) / basePrice) * 100);
    return {
      base: basePrice,
      promo: precoCustomizado,
      emPromocao: true,
      promocaoTipo: null,
      promocaoValor: null,
      badge: "PROMO",
      discountLabel: discountPercent > 0 ? `${discountPercent}% OFF` : null,
    };
  }

  // Custom price equal or higher than base — use as base price (no promo)
  if (precoCustomizado != null) {
    return {
      base: precoCustomizado,
      promo: null,
      emPromocao: false,
      promocaoTipo: null,
      promocaoValor: null,
      badge: null,
      discountLabel: null,
    };
  }

  // Category-level promo
  const emPromocao = config.promocao_ativa[tipo] ?? false;
  const promo = emPromocao ? (config.precos_promocao[tipo] ?? basePrice) : null;
  const discountPercent = emPromocao && promo !== null ? Math.round(((basePrice - promo) / basePrice) * 100) : null;
  return {
    base: basePrice,
    promo,
    emPromocao,
    promocaoTipo: null,
    promocaoValor: null,
    badge: emPromocao ? "PROMO" : null,
    discountLabel: emPromocao && discountPercent !== null ? `${discountPercent}% OFF` : null,
  };
}

/** Preço da personalização por tipo de produto */
export const PRECO_PERSONALIZACAO_BASE = 25.00;
export const PRECO_PERSONALIZACAO_TORCEDOR = 20.00;

/** Tipos de produto com preço de personalização reduzido (apenas Torcedor) */
const TIPOS_PERSONALIZACAO_REDUZIDA = ["Torcedor"];

/** Retorna o preço da personalização de acordo com o tipo de produto */
export function precoPersonalizacao(tipo: string): number {
  if (TIPOS_PERSONALIZACAO_REDUZIDA.includes(tipo)) return PRECO_PERSONALIZACAO_TORCEDOR;
  return PRECO_PERSONALIZACAO_BASE;
}

/** @deprecated Use precoPersonalizacao(tipo) instead */
export const PRECO_PERSONALIZACAO = PRECO_PERSONALIZACAO_BASE;

export const PRONTA_ENTREGA_MARKUP = 1.15;

export const ADICIONAL_TAMANHO: Record<string, number> = {
  "G2": 10.00,
  "G3": 20.00,
};

/** Tamanhos exibidos para o cliente (modelo brasileiro) */
export const TAMANHOS = ["P", "M", "G", "GG", "G1", "G2", "G3"];

/** Tamanhos disponíveis por tipo de produto */
export const TAMANHOS_POR_TIPO: Record<string, string[]> = {
  "Torcedor": ["P", "M", "G", "GG", "G1", "G2", "G3"],
  "Manga Longa Torcedor": ["P", "M", "G", "GG", "G1"],
  "Manga Longa Jogador": ["P", "M", "G", "GG", "G1", "G2", "G3"],
  "Manga Longa Retrô": ["P", "M", "G", "GG", "G1"],
  "Goleiro": ["P", "M", "G", "GG", "G1"],
  "Jogador": ["P", "M", "G", "GG", "G1", "G2", "G3"],
  "Retrô": ["P", "M", "G", "GG", "G1"],
  "Treinamento": ["P", "M", "G", "GG", "G1"],
  "NBA": ["P", "M", "G", "GG", "G1", "G2"],
  "Polo": ["P", "M", "G", "GG"],
};

/** Tamanhos da versão feminina */
export const TAMANHOS_FEMININA = ["P", "M", "G", "GG"];

/** Retorna tamanhos disponíveis para o tipo e gênero do produto */
export function tamanhosDisponiveis(tipo: string, feminino: boolean): string[] {
  if (feminino) return TAMANHOS_FEMININA;
  return TAMANHOS_POR_TIPO[tipo] ?? TAMANHOS;
}

/** Mapeamento de tamanho BR → internacional para envio ao fornecedor */
export const TAMANHO_FORNECEDOR: Record<string, string> = {
  "P": "S",
  "M": "M",
  "G": "L",
  "GG": "XL",
  "G1": "2XL",
  "G2": "3XL",
  "G3": "4XL",
};

/** Exibe tamanho no formato brasileiro para o cliente */
export function tamanhoCliente(tamanhoInternacional: string): string {
  const map: Record<string, string> = {
    "S": "P",
    "M": "M",
    "L": "G",
    "XL": "GG",
    "2XL": "G1",
    "3XL": "G2",
    "4XL": "G3",
  };
  return map[tamanhoInternacional] || tamanhoInternacional;
}

export const FABRICANTES = ["Nike", "Adidas", "Puma", "New Balance", "Umbro", "Kappa", "Joma", "Outro"];

export const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || "5511999999999";
export const WHATSAPP_SUPPORT = import.meta.env.VITE_WHATSAPP_SUPPORT || "5511999999999";

export function gerarId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let result = "UL-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(bytes[i] % chars.length);
  }
  return result;
}

export function calcularPreco(
  tipo: string,
  tamanho: string,
  personalizado: boolean,
  config?: LojaConfig,
  precoCustomizado?: number | null,
  promocaoTipo?: PromocaoTipo,
  promocaoValor?: number | null,
): number {
  const { promo, base } = getPrecoProduto(tipo, config ?? DEFAULT_CONFIG, precoCustomizado, promocaoTipo, promocaoValor);
  let preco = promo ?? base;
  if (ADICIONAL_TAMANHO[tamanho]) preco += ADICIONAL_TAMANHO[tamanho];
  if (personalizado) preco += precoPersonalizacao(tipo);
  return preco;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function montarMensagemPagamento(order: Order): string {
  let msg = `*RM Imports - Pedido ${order.id}*\n`;
  msg += `Data: ${order.data} às ${order.hora}\n\n`;
  msg += `*Resumo do Pedido:*\n`;

  order.itens.forEach((item, i) => {
    msg += `\n*${i + 1}. ${item.nome}*\n`;
    msg += `   • Tamanho: ${item.tamanho}\n`;
    msg += `   • Modelo: ${item.genero}\n`;
    msg += `   • Tipo: ${item.tipo}\n`;
    if (item.personalizado) {
      msg += `   • Nome: ${item.nomePersonalizado}\n`;
      msg += `   • Número: ${item.numeroPersonalizado}\n`;
    }
    if (item.precoBase != null && item.precoBase > item.preco) {
      msg += `   • Valor: ~~${formatarMoeda(item.precoBase)}~~ ${formatarMoeda(item.preco)}\n`;
    } else {
      msg += `   • Valor: ${formatarMoeda(item.preco)}\n`;
    }
  });

  if (order.endereco) {
    const e = order.endereco;
    msg += `\n*Endereço de Entrega:*\n`;
    msg += `${e.nome}\n`;
    msg += `${e.rua}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ""}\n`;
    msg += `${e.bairro} - ${e.cidade}/${e.estado}\n`;
    msg += `CEP: ${e.cep}\n`;
    msg += `Tel: ${e.telefone}\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━\n`;
  msg += `*Total: ${formatarMoeda(order.total)}*\n\n`;
  msg += `Aguardo confirmação do pagamento.`;
  return msg;
}

import { TIPO_ENGLISH } from "./lib/status";

export function montarMensagemItem(item: OrderItem): string {
  const tipoEn = TIPO_ENGLISH[item.tipo] || item.tipo;
  const version = item.feminino && item.genero === "Feminino"
    ? `${tipoEn} WOMENS`
    : `${tipoEn}`;
  const sizeForSupplier = TAMANHO_FORNECEDOR[item.tamanho] || item.tamanho;

  const lines: string[] = [];
  lines.push(`Version: ${version}`);
  lines.push(`Size: ${sizeForSupplier}`);
  if (item.personalizado) {
    lines.push(`Name: ${item.nomePersonalizado}`);
    lines.push(`Number: ${item.numeroPersonalizado}`);
  }
  return lines.join("\n");
}

export function montarMensagemPacote(orders: Order[]): string {
  const items = orders.flatMap((o) => o.itens);
  const lines: string[] = [];

  items.forEach((item, i) => {
    if (i > 0) lines.push("-------");
    lines.push("");
    lines.push(montarMensagemItem(item));
  });

  return lines.join("\n").trimEnd();
}

const IMAGE_CACHE_V = "v3";

export function proxyImageUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/api/image")) return url; // already proxied
  return `/api/image?url=${encodeURIComponent(url)}&${IMAGE_CACHE_V}`;
}

/**
 * Converte URL de imagem Yupoo para um tamanho menor.
 * Yupoo suporta: small.jpg, medium.jpg, large.jpg
 * Usa "small" para grid (thumbnails) e "medium" para detalhes.
 */
export function yupooThumbnailUrl(url: string, size: "small" | "medium" | "large" = "small"): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/api/image")) return url; // already proxied
  const replaced = url.replace(/\/(small|medium|large)\.jpg$/i, `/${size}.jpg`);
  return `/api/image?url=${encodeURIComponent(replaced)}&${IMAGE_CACHE_V}`;
}

/** Pre-cached Supabase Storage URLs per image, indexed by size variant */
export type CachedImageMap = { small?: string; medium?: string; large?: string }[];

/**
 * Returns the best available URL for a product image.
 * Uses pre-cached Supabase Storage URLs directly when available,
 * eliminating the /api/image proxy and reducing Supabase egress.
 * Falls back to the proxy for uncached images.
 */
export function getCachedImageUrl(
  imageUrl: string,
  cachedUrls: CachedImageMap | undefined | null,
  index: number,
  size: "small" | "medium" | "large" = "medium",
): string {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("data:")) return imageUrl;

  // Use pre-cached Supabase Storage URL directly when available.
  // This eliminates the /api/image proxy for cached images, reducing
  // Supabase Storage egress by letting browsers cache the direct URL.
  if (cachedUrls && Array.isArray(cachedUrls) && index < cachedUrls.length) {
    const cached = cachedUrls[index];
    if (cached && cached[size]) {
      return cached[size]!;
    }
  }

  // Fallback to proxy for uncached images
  return yupooThumbnailUrl(imageUrl, size);
}

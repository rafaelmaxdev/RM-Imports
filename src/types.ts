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
  yupooUrl: string;
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
}

export type PaymentMethod = "pix" | "credit_card" | "debit_card";

export interface Order {
  id: string;
  data: string;
  hora: string;
  itens: OrderItem[];
  total: number;
  status: "pendente" | "pago" | "entregue" | "cancelado";
  endereco?: OrderAddress;
  payment_method?: PaymentMethod;
  mp_preference_id?: string;
  mp_payment_id?: string;
}

export const PRECOS_BASE: Record<string, number> = {
  "Torcedor": 129.90,
  "Jogador": 169.90,
  "Retrô": 169.90,
  "Manga Longa": 159.90,
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
    "Manga Longa": 159.90,
    "Goleiro": 129.90,
    "Treinamento": 139.90,
    "Polo": 139.90,
    "NBA": 189.90,
  },
  precos_promocao: {
    "Torcedor": 109.90,
    "Jogador": 139.90,
    "Retrô": 149.90,
    "Manga Longa": 139.90,
    "Goleiro": 109.90,
    "Treinamento": 119.90,
    "Polo": 119.90,
    "NBA": 169.90,
  },
  promocao_ativa: {
    "Torcedor": false,
    "Jogador": false,
    "Retrô": false,
    "Manga Longa": false,
    "Goleiro": false,
    "Treinamento": false,
    "Polo": false,
    "NBA": false,
  },
};

export const TIPOS_CATEGORIA = ["Torcedor", "Jogador", "Retrô", "Manga Longa", "Goleiro", "Treinamento", "Polo", "NBA"] as const;

export type PromocaoTipo = "porcentagem" | "novo_preco" | "leve_pague" | null;

/** Tipos que NÃO permitem personalização (nome/número) */
export const TIPOS_SEM_PERSONALIZACAO = ["Polo"];

/** Tipos que NÃO têm opção feminina */
export const TIPOS_SEM_FEMININO = ["NBA", "Polo", "Treinamento", "Goleiro"];

export interface PromocaoInfo {
  base: number;
  promo: number | null;
  emPromocao: boolean;
  promocaoTipo: PromocaoTipo;
  promocaoValor: number | null;
  badge: string | null;
}

export function getPrecoProduto(
  tipo: string,
  config: LojaConfig,
  precoCustomizado?: number | null,
  promocaoTipo?: PromocaoTipo,
  promocaoValor?: number | null,
): PromocaoInfo {
  const base = precoCustomizado ?? config.precos_base[tipo] ?? 89.90;

  // Individual product promo takes priority
  if (promocaoTipo === "porcentagem" && promocaoValor) {
    const desconto = base * (promocaoValor / 100);
    const promoPrice = Math.round((base - desconto) * 100) / 100;
    return {
      base,
      promo: promoPrice,
      emPromocao: true,
      promocaoTipo,
      promocaoValor,
      badge: `${promocaoValor}% OFF`,
    };
  }

  if (promocaoTipo === "novo_preco" && precoCustomizado != null) {
    const originalBase = config.precos_base[tipo] ?? 89.90;
    return {
      base: originalBase,
      promo: precoCustomizado,
      emPromocao: true,
      promocaoTipo,
      promocaoValor: null,
      badge: "PROMO",
    };
  }

  if (promocaoTipo === "leve_pague") {
    return {
      base,
      promo: null,
      emPromocao: true,
      promocaoTipo,
      promocaoValor: null,
      badge: "LEVE 1 PAGUE 2",
    };
  }

  // Category-level promo
  const emPromocao = config.promocao_ativa[tipo] ?? false;
  const promo = emPromocao ? (config.precos_promocao[tipo] ?? base) : null;
  return {
    base,
    promo,
    emPromocao,
    promocaoTipo: null,
    promocaoValor: null,
    badge: emPromocao ? "PROMO" : null,
  };
}

export const PRECO_PERSONALIZACAO = 25.00;

export const ADICIONAL_TAMANHO: Record<string, number> = {
  "G1": 10.00,
  "G2": 15.00,
  "G3": 20.00,
};

export const TAMANHOS = ["P", "M", "G", "GG", "G1", "G2", "G3"];

export const FABRICANTES = ["Nike", "Adidas", "Puma", "New Balance", "Umbro", "Kappa", "Joma", "Outro"];

export const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || "5511999999999";

export function gerarId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "UL-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
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
  if (personalizado) preco += PRECO_PERSONALIZACAO;
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
    msg += `   • Valor: ${formatarMoeda(item.preco)}\n`;
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

export function montarMensagemFornecedor(order: Order): string {
  let msg = `*Pedido ${order.id}*\n\n`;

  order.itens.forEach((item, i) => {
    msg += `*${i + 1}. ${item.nome}*\n`;
    msg += `   - Tipo: ${item.tipo}\n`;
    msg += `   - Tamanho: ${item.tamanho}\n`;
    msg += `   - Modelo: ${item.genero}\n`;
    if (item.personalizado) {
      msg += `   - Nome: ${item.nomePersonalizado}\n`;
      msg += `   - Número: ${item.numeroPersonalizado}\n`;
    }
    msg += `   - Link: ${item.yupooUrl || "N/A"}\n\n`;
  });

  return msg;
}

export function proxyImageUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

/**
 * Converte URL de imagem Yupoo para um tamanho menor.
 * Yupoo suporta: small.jpg, medium.jpg, large.jpg
 * Usa "small" para grid (thumbnails) e "medium" para detalhes.
 */
export function yupooThumbnailUrl(url: string, size: "small" | "medium" | "large" = "small"): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  // Substitui o tamanho na URL do Yupoo
  // Ex: https://photo.yupoo.com/minkang/fc499d7c97/medium.jpg → .../small.jpg
  const replaced = url.replace(/\/(small|medium|large)\.jpg$/i, `/${size}.jpg`);
  return `/api/image?url=${encodeURIComponent(replaced)}`;
}

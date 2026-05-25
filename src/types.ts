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
  feminino: boolean;
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
  status: "pendente" | "em_analise" | "pago" | "enviado_fornecedor" | "em_producao" | "a_caminho" | "em_estoque" | "em_entrega" | "entregue" | "cancelado" | "reembolsado";
  endereco?: OrderAddress;
  payment_method?: PaymentMethod;
  mp_preference_id?: string;
  mp_payment_id?: string;
  admin_order?: boolean;
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
      badge: "PROMO",
      discountLabel: `${promocaoValor}% OFF`,
    };
  }

  if (promocaoTipo === "novo_preco" && precoCustomizado != null) {
    const originalBase = config.precos_base[tipo] ?? 89.90;
    const discountPercent = Math.round(((originalBase - precoCustomizado) / originalBase) * 100);
    return {
      base: originalBase,
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
      base,
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
      base,
      promo: null,
      emPromocao: true,
      promocaoTipo,
      promocaoValor: null,
      badge: "PROMO",
      discountLabel: "33% OFF",
    };
  }

  // Category-level promo
  const emPromocao = config.promocao_ativa[tipo] ?? false;
  const promo = emPromocao ? (config.precos_promocao[tipo] ?? base) : null;
  const discountPercent = emPromocao && promo !== null ? Math.round(((base - promo) / base) * 100) : null;
  return {
    base,
    promo,
    emPromocao,
    promocaoTipo: null,
    promocaoValor: null,
    badge: emPromocao ? "PROMO" : null,
    discountLabel: emPromocao && discountPercent !== null ? `${discountPercent}% OFF` : null,
  };
}

export const PRECO_PERSONALIZACAO = 25.00;

export const ADICIONAL_TAMANHO: Record<string, number> = {
  "3XL": 10.00,
  "4XL": 20.00,
};

export const TAMANHOS = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];

/** Mapeamento de tamanho BR → internacional para envio ao fornecedor */
export const TAMANHO_FORNECEDOR: Record<string, string> = {
  "S": "S",
  "M": "M",
  "L": "L",
  "XL": "XL",
  "2XL": "2XL",
  "3XL": "3XL",
  "4XL": "4XL",
};

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

const TIPO_ENGLISH: Record<string, string> = {
  "Torcedor": "Fan",
  "Jogador": "Player",
  "Retrô": "Retro",
  "Manga Longa": "Long Sleeve",
  "Goleiro": "Goalkeeper",
  "Treinamento": "Training",
  "Polo": "Polo",
  "NBA": "NBA",
};

export function montarMensagemPacote(orders: Order[]): string {
  const totalCamisas = orders.reduce((sum, o) => sum + o.itens.length, 0);
  let msg = `*Pacote RM Imports*\n`;
  msg += `📦 ${orders.length} pedido(s) • ${totalCamisas} camisa(s)\n`;

  orders.forEach((order) => {
    msg += `\n━━━━━━━━━━━━━━━\n\n`;
    msg += `*Pedido ${order.id}*\n`;

    order.itens.forEach((item, i) => {
      const tipoEn = TIPO_ENGLISH[item.tipo] || item.tipo;
      const version = item.feminino && item.genero === "Feminino"
        ? `${tipoEn} WOMANS`
        : `${tipoEn} MALE`;

      const sizeForSupplier = TAMANHO_FORNECEDOR[item.tamanho] || item.tamanho;

      msg += `${i + 1}.\n`;
      msg += `Link: ${item.yupooUrl || "N/A"}\n`;
      msg += `Size: ${sizeForSupplier}\n`;
      if (item.temporada) {
        msg += `Patch: ${item.temporada}\n`;
      }
      msg += `Version: ${version}\n`;
      if (item.personalizado) {
        msg += `Name: ${item.nomePersonalizado}\n`;
        msg += `Number: ${item.numeroPersonalizado}\n`;
      }
      if (i < order.itens.length - 1) msg += `\n`;
    });
  });

  msg += `\n━━━━━━━━━━━━━━━\n`;
  msg += `Total: ${totalCamisas} camisa(s) em ${orders.length} pedido(s)`;

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

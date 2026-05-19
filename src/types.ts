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

export interface Order {
  id: string;
  data: string;
  hora: string;
  itens: OrderItem[];
  total: number;
  status: "pendente" | "confirmado" | "entregue";
  endereco?: OrderAddress;
}

export const PRECOS_BASE: Record<string, number> = {
  "Torcedor": 89.90,
  "Jogador": 129.90,
  "Retrô": 129.90,
  "Manga Longa": 99.90,
};

export const PRECO_PERSONALIZACAO = 25.00;

export const ADICIONAL_TAMANHO: Record<string, number> = {
  "2XL": 10.00,
  "3XL": 15.00,
  "4XL": 20.00,
};

export const TAMANHOS = ["P", "M", "G", "GG", "XG", "2XL", "3XL", "4XL"];

export const FABRICANTES = ["Nike", "Adidas", "Puma", "New Balance", "Umbro", "Kappa", "Joma", "Outro"];

export const WHATSAPP_NUMBER = "5511999999999";

export function gerarId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "UL-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function calcularPreco(tipo: string, tamanho: string, personalizado: boolean): number {
  let preco = PRECOS_BASE[tipo] || 89.90;
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

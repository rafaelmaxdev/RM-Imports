/**
 * Shared status, payment, and type mapping constants.
 * Single source of truth — import from here instead of duplicating.
 */

// ── Order status configuration ──

export const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon?: string }> = {
  pendente: { label: "Aguardando pagamento", bg: "bg-yellow-100", text: "text-yellow-800", icon: "⏳" },
  pago: { label: "Pagamento confirmado", bg: "bg-green-100", text: "text-green-800", icon: "✓" },
  enviado_fornecedor: { label: "Enviado ao fornecedor", bg: "bg-blue-100", text: "text-blue-800", icon: "📤" },
  em_producao: { label: "Em produção", bg: "bg-purple-100", text: "text-purple-800", icon: "🏭" },
  a_caminho: { label: "A caminho", bg: "bg-indigo-100", text: "text-indigo-800", icon: "✈️" },
  em_estoque: { label: "Em estoque", bg: "bg-teal-100", text: "text-teal-800", icon: "📦" },
  em_entrega: { label: "Em entrega", bg: "bg-cyan-100", text: "text-cyan-800", icon: "🚚" },
  entregue: { label: "Entregue", bg: "bg-emerald-100", text: "text-emerald-800", icon: "✅" },
  cancelado: { label: "Cancelado", bg: "bg-red-100", text: "text-red-800", icon: "✕" },
  reembolsado: { label: "Reembolsado", bg: "bg-gray-100", text: "text-gray-800", icon: "↩" },
};

/** Admin-only status config (without icons, for compact views) */
export const STATUS_CONFIG_ADMIN: Record<string, { label: string; bg: string; text: string }> = {
  pendente: { label: "Pendente", bg: "bg-yellow-100", text: "text-yellow-800" },
  pago: { label: "Pago", bg: "bg-green-100", text: "text-green-800" },
  enviado_fornecedor: { label: "Enviado ao fornecedor", bg: "bg-blue-100", text: "text-blue-800" },
  em_producao: { label: "Em produção", bg: "bg-purple-100", text: "text-purple-800" },
  a_caminho: { label: "A caminho", bg: "bg-indigo-100", text: "text-indigo-800" },
  em_estoque: { label: "Em estoque", bg: "bg-teal-100", text: "text-teal-800" },
  em_entrega: { label: "Em entrega", bg: "bg-cyan-100", text: "text-cyan-800" },
  entregue: { label: "Entregue", bg: "bg-emerald-100", text: "text-emerald-800" },
  cancelado: { label: "Cancelado", bg: "bg-red-100", text: "text-red-800" },
  reembolsado: { label: "Reembolsado", bg: "bg-gray-100", text: "text-gray-800" },
};

/** Status flow for admin order management */
export const STATUS_FLOW: Record<string, string[]> = {
  pendente: ["pago", "cancelado"],
  pago: ["reembolsado", "cancelado"],
  enviado_fornecedor: ["em_producao"],
  em_producao: ["a_caminho"],
  a_caminho: ["em_estoque"],
  em_estoque: ["em_entrega"],
  em_entrega: ["entregue"],
};

// ── Package status pipeline ──

export const PACKAGE_STATUS_PIPELINE = [
  "pago",
  "enviado_fornecedor",
  "em_producao",
  "a_caminho",
  "em_estoque",
  "em_entrega",
  "entregue",
] as const;

export const PACKAGE_STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  pago: { label: "Aguardando envio", bg: "bg-yellow-100", text: "text-yellow-800" },
  enviado_fornecedor: { label: "Enviado", bg: "bg-blue-100", text: "text-blue-800" },
  em_producao: { label: "Em produção", bg: "bg-purple-100", text: "text-purple-800" },
  a_caminho: { label: "A caminho", bg: "bg-indigo-100", text: "text-indigo-800" },
  em_estoque: { label: "Em estoque", bg: "bg-teal-100", text: "text-teal-800" },
  em_entrega: { label: "Em entrega", bg: "bg-cyan-100", text: "text-cyan-800" },
  entregue: { label: "Entregue", bg: "bg-green-100", text: "text-green-800" },
};

export const PACKAGE_NEXT_STATUS: Record<string, string> = {
  pago: "enviado_fornecedor",
  enviado_fornecedor: "em_producao",
  em_producao: "a_caminho",
  a_caminho: "em_estoque",
  em_estoque: "em_entrega",
  em_entrega: "entregue",
};

export const PACKAGE_PREV_STATUS: Record<string, string> = {
  em_producao: "enviado_fornecedor",
  a_caminho: "em_producao",
  em_estoque: "a_caminho",
  em_entrega: "em_estoque",
  entregue: "em_entrega",
  enviado_fornecedor: "pago",
};

export const PACKAGE_PREV_ACTION_LABELS: Record<string, string> = {
  em_producao: "Enviado ao fornecedor",
  a_caminho: "Em produção",
  em_estoque: "A caminho",
  em_entrega: "Em estoque",
  entregue: "Em entrega",
  enviado_fornecedor: "Pago",
};

export const PACKAGE_STATUS_ACTION_LABELS: Record<string, string> = {
  pago: "Enviar ao Fornecedor",
  enviado_fornecedor: "Em Produção",
  em_producao: "A Caminho",
  a_caminho: "Em Estoque",
  em_estoque: "Em Entrega",
  em_entrega: "Entregue",
};

// ── Payment labels ──

export const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
};

export const PAYMENT_LABELS_SHORT: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão",
  debit_card: "Débito",
};

// ── Type translations ──

export const TIPO_ENGLISH: Record<string, string> = {
  "Torcedor": "Fan",
  "Jogador": "Player",
  "Retrô": "Retro",
  "Manga Longa": "Long Sleeve",
  "Goleiro": "Goalkeeper",
  "Treinamento": "Training",
  "Polo": "Polo",
  "NBA": "NBA",
};

// ── MP fee rates ──

export const MP_FEE_RATES: Record<string, number> = {
  pix: 0.0099,
  debit_card: 0.0399,
};

export const MP_CREDIT_CARD_RATES: Record<string, number> = {
  immediate: 0.0499,
  "14_days": 0.0449,
  "30_days": 0.0399,
};

export function getMPFeeRate(paymentMethod: string | undefined, creditReleasePeriod: string | undefined): number {
  if (paymentMethod === "credit_card") {
    return MP_CREDIT_CARD_RATES[creditReleasePeriod || "immediate"] ?? 0.0499;
  }
  return MP_FEE_RATES[paymentMethod || ""] ?? 0.0499;
}
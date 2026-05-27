import { supabase } from "./supabase";
import type { LojaConfig, OrderItem, OrderAddress } from "../types";
import { DEFAULT_CONFIG } from "../types";

export interface DbProduto {
  id: string;
  nome: string;
  liga: string;
  time: string;
  tipo: string;
  temporada: string;
  imagem_urls: string[];
  yupoo_url: string;
  destaque: boolean;
  preco_customizado: number | null;
  promocao: boolean;
  promocao_tipo: string | null;   // 'porcentagem' | 'novo_preco' | 'leve_pague' | 'leve_3_pague_2' | null
  promocao_valor: number | null;  // percentage for 'porcentagem', null for others
  feminino: boolean;
  peca: string | null;            // 'camisa' | 'regata' — null means 'camisa' (default)
  created_at: string;
}

/** Normaliza imagem_urls vindo do Supabase (jsonb) ou formato antigo (string) */
export function parseImageUrls(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value) return [value];
  return [];
}

export async function getProdutos(): Promise<DbProduto[]> {
  const { data, error } = await supabase
    .from("produtos")
    .select("id,nome,liga,time,tipo,temporada,imagem_urls,yupoo_url,destaque,preco_customizado,promocao,promocao_tipo,promocao_valor,feminino,peca,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];

  const seen = new Set<string>();
  return data.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/** Columns that actually exist in the Supabase 'produtos' table.
 *  If a column is missing from the DB, it will be filtered out before insert/update.
 */
const PRODUTOS_COLUMNS = new Set([
  "id", "nome", "liga", "time", "tipo", "temporada",
  "imagem_urls", "yupoo_url", "destaque", "created_at",
  "preco_customizado", "promocao", "promocao_tipo", "promocao_valor", "peca",
  "feminino", // ← adicione esta coluna no banco: ALTER TABLE produtos ADD COLUMN feminino boolean DEFAULT false NOT NULL;
]);

function stripMissingColumns<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PRODUTOS_COLUMNS.has(key)) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

export async function addProduto(p: Omit<DbProduto, "id" | "created_at">): Promise<DbProduto> {
  const row = stripMissingColumns(p);
  const { data, error } = await supabase
    .from("produtos")
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProduto(id: string, p: Partial<Omit<DbProduto, "id" | "created_at">>): Promise<DbProduto> {
  const row = stripMissingColumns(p);
  const { data, error } = await supabase
    .from("produtos")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProduto(id: string): Promise<void> {
  const { error } = await supabase
    .from("produtos")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ── Loja Config ──

export async function getLojaConfig(): Promise<LojaConfig> {
  const { data, error } = await supabase
    .from("loja_config")
    .select("key, value");

  if (error) throw error;
  if (!data) return DEFAULT_CONFIG;

  const config = { ...DEFAULT_CONFIG };
  for (const row of data) {
    if (row.key === "precos_base" && typeof row.value === "object") {
      config.precos_base = row.value as Record<string, number>;
    } else if (row.key === "precos_promocao" && typeof row.value === "object") {
      config.precos_promocao = row.value as Record<string, number>;
    } else if (row.key === "promocao_ativa" && typeof row.value === "object") {
      config.promocao_ativa = row.value as Record<string, boolean>;
    }
  }
  return config;
}

export async function updateLojaConfig(
  key: "precos_base" | "precos_promocao" | "promocao_ativa",
  value: Record<string, number> | Record<string, boolean>,
): Promise<void> {
  const { error } = await supabase
    .from("loja_config")
    .upsert({ key, value }, { onConflict: "key" });

  if (error) throw error;
}

export async function toggleDestaque(id: string, destaque: boolean): Promise<void> {
  const { error } = await supabase
    .from("produtos")
    .update({ destaque })
    .eq("id", id);

  if (error) throw error;
}

export async function setPromocaoCategoria(tipo: string, ativa: boolean): Promise<void> {
  const { error } = await supabase
    .from("produtos")
    .update({ promocao: ativa })
    .eq("tipo", tipo);

  if (error) throw error;
}

export async function setDescontoGlobal(porcentagem: number): Promise<DbProduto[]> {
  const { data, error } = await supabase
    .from("produtos")
    .update({
      promocao: true,
      promocao_tipo: "porcentagem",
      promocao_valor: porcentagem,
    })
    .not("id", "is", null)
    .select();

  if (error) throw error;
  return data as DbProduto[];
}

export async function removeDescontoGlobal(): Promise<DbProduto[]> {
  const { data, error } = await supabase
    .from("produtos")
    .update({
      promocao: false,
      promocao_tipo: null,
      promocao_valor: null,
    })
    .eq("promocao_tipo", "porcentagem")
    .select();

  if (error) throw error;
  return data as DbProduto[];
}

export async function updateProdutoCustomPrice(id: string, preco_customizado: number | null): Promise<void> {
  const { error } = await supabase
    .from("produtos")
    .update({ preco_customizado })
    .eq("id", id);

  if (error) throw error;
}

// ── Pedidos ──

export interface DbPedido {
  id: string;
  data: string;
  hora: string;
  itens: OrderItem[] | string; // JSONB: can arrive as parsed object or string
  total: number;
  status: string;
  endereco: OrderAddress | string | null; // JSONB: can arrive as parsed object or string
  payment_method: string | null;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  admin_order: boolean | null;
  credit_release_period?: "immediate" | "14_days" | "30_days" | null;
  created_at: string;
}

function dbPedidoToOrder(db: DbPedido): import("../types").Order {
  return {
    id: db.id,
    data: db.data,
    hora: db.hora,
    itens: typeof db.itens === "string" ? JSON.parse(db.itens) : db.itens,
    total: db.total,
    status: db.status as import("../types").Order["status"],
    endereco: db.endereco
      ? (typeof db.endereco === "string" ? JSON.parse(db.endereco) : db.endereco)
      : undefined,
    payment_method: (db.payment_method as import("../types").PaymentMethod) || undefined,
    mp_preference_id: db.mp_preference_id || undefined,
    mp_payment_id: db.mp_payment_id || undefined,
    admin_order: db.admin_order ?? false,
  };
}

export async function createPedido(order: import("../types").Order): Promise<import("../types").Order> {
const row = {
    id: order.id,
    data: order.data,
    hora: order.hora,
    itens: JSON.stringify(order.itens),
    total: order.total,
    status: order.status,
    endereco: order.endereco ? JSON.stringify(order.endereco) : null,
    payment_method: order.payment_method || null,
    mp_preference_id: order.mp_preference_id || null,
    mp_payment_id: order.mp_payment_id || null,
    admin_order: order.admin_order || null,
  };

  const { data, error } = await supabase
    .from("pedidos")
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return dbPedidoToOrder(data as DbPedido);
}

export async function getPedidos(): Promise<import("../types").Order[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];
  return (data as DbPedido[]).map(dbPedidoToOrder);
}

export async function getPedidoById(id: string): Promise<import("../types").Order | null> {
  // Use the API route for unauthenticated access (RLS restricts direct Supabase reads)
  try {
    const res = await fetch(`/api/order/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch order: ${res.status}`);
    const data = await res.json();
    return {
      ...data,
      itens: typeof data.itens === "string" ? JSON.parse(data.itens) : data.itens,
      endereco: data.endereco
        ? (typeof data.endereco === "string" ? JSON.parse(data.endereco) : data.endereco)
        : undefined,
    };
  } catch (err) {
    console.error("Error fetching order via API:", err);
    return null;
  }
}

export async function updatePedidoStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("pedidos")
    .update({ status })
    .eq("id", id);

  if (error) {
    // Provide user-friendly message for status transition violations
    if (error.message?.includes("Invalid status transition") || error.message?.includes("Invalid initial status")) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export async function updatePedidoAdminOrder(id: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase
    .from("pedidos")
    .update({ admin_order: isAdmin })
    .eq("id", id);

  if (error) throw error;
}

export async function deletePedido(id: string): Promise<void> {
  const { error } = await supabase
    .from("pedidos")
    .delete()
    .eq("id", id);

  if (error) {
    if (error.code === "42501" || error.message?.includes("policy") || error.message?.includes("RLS")) {
      throw new Error("Apenas pedidos cancelados podem ser excluídos.");
    }
    throw error;
  }
}

// ── Pacotes ──

export interface DbPacote {
  id: string;
  status: string;
  custo: number | null;
  frete: number | null;
  taxa_importacao: number | null;
  pedido_ids: string; // JSONB stored as string from Supabase
  created_at: string;
}

export interface Pacote {
  id: string;
  status: string;
  custo: number | null;
  frete: number | null;
  taxa_importacao: number | null;
  pedido_ids: string[];
  created_at: string;
}

function dbPacoteToPacote(db: DbPacote): Pacote {
  return {
    id: db.id,
    status: db.status,
    custo: db.custo,
    frete: db.frete,
    taxa_importacao: db.taxa_importacao,
    pedido_ids: typeof db.pedido_ids === "string" ? JSON.parse(db.pedido_ids) : db.pedido_ids,
    created_at: db.created_at,
  };
}

export async function createPacote(pedido_ids: string[]): Promise<Pacote> {
  const row = {
    status: "pago",
    custo: null,
    frete: null,
    taxa_importacao: null,
    pedido_ids: JSON.stringify(pedido_ids),
  };

  const { data, error } = await supabase
    .from("pacotes")
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return dbPacoteToPacote(data as DbPacote);
}

export async function getPacotes(): Promise<Pacote[]> {
  const { data, error } = await supabase
    .from("pacotes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];
  return (data as DbPacote[]).map(dbPacoteToPacote);
}

export async function updatePacoteStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("pacotes")
    .update({ status })
    .eq("id", id);

  if (error) throw error;
}

export async function updatePacoteFinanceiro(
  id: string,
  financeiro: { custo: number | null; frete: number | null; taxa_importacao: number | null }
): Promise<void> {
  const { error } = await supabase
    .from("pacotes")
    .update(financeiro)
    .eq("id", id);

  if (error) {
    if (error.message?.includes("chk_") || error.message?.includes("non_negative") || error.message?.includes("check constraint")) {
      throw new Error("Valores financeiros não podem ser negativos.");
    }
    throw error;
  }
}

export async function removePedidoFromPacote(pacoteId: string, pedidoId: string): Promise<Pacote> {
  // First get the current pacote
  const { data: pacote, error: fetchError } = await supabase
    .from("pacotes")
    .select("*")
    .eq("id", pacoteId)
    .single();

  if (fetchError) throw fetchError;
  if (!pacote) throw new Error("Pacote não encontrado");

  // Check if pacote is already delivered
  if (pacote.status === "entregue") {
    throw new Error("Não é possível remover pedidos de um pacote já entregue.");
  }

  const currentIds: string[] = typeof pacote.pedido_ids === "string" ? JSON.parse(pacote.pedido_ids) : pacote.pedido_ids;
  const newIds = currentIds.filter((id: string) => id !== pedidoId);

  const { data, error } = await supabase
    .from("pacotes")
    .update({ pedido_ids: JSON.stringify(newIds) })
    .eq("id", pacoteId)
    .select()
    .single();

  if (error) {
    if (error.message?.includes("entregue") || error.message?.includes("delivered")) {
      throw new Error("Não é possível modificar pedidos de um pacote já entregue.");
    }
    throw error;
  }
  return dbPacoteToPacote(data as DbPacote);
}

export async function deletePacote(id: string): Promise<void> {
  const { error } = await supabase
    .from("pacotes")
    .delete()
    .eq("id", id);

  if (error) {
    if (error.message?.includes("entregue") || error.message?.includes("delivered")) {
      throw new Error("Não é possível excluir um pacote já entregue.");
    }
    throw error;
  }
}

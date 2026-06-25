import { supabase } from "./supabase";
import type { LojaConfig, OrderItem, OrderAddress, CachedImageMap, EstoqueItem } from "../types";
import { DEFAULT_CONFIG } from "../types";
import { getCached, setCache, isCacheStale } from "./cache";

export interface DbProduto {
  id: string;
  nome: string;
  liga: string;
  time: string;
  tipo: string;
  temporada: string;
  imagem_urls: string[];
  imagem_urls_feminina?: string[];
  yupoo_url: string;
  destaque: boolean;
  ordem_destaque: number | null;
  preco_customizado: number | null;
  promocao: boolean;
  promocao_tipo: string | null;   // 'porcentagem' | 'novo_preco' | 'leve_pague' | 'leve_3_pague_2' | null
  promocao_valor: number | null;  // percentage for 'porcentagem', null for others
  feminino: boolean;
  peca: string | null;            // 'camisa' | 'regata' — null means 'camisa' (default)
  cached_image_urls?: CachedImageMap | null; // Pre-cached Supabase Storage URLs per image per size
  created_at: string;
}

/** Normaliza imagem_urls vindo do Supabase (jsonb) ou formato antigo (string) */
export function parseImageUrls(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value) return [value];
  return [];
}

export async function getProdutos(): Promise<DbProduto[]> {
  const CACHE_KEY = "produtos";
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const cached = getCached<DbProduto[]>(CACHE_KEY);
  if (cached) {
    // Stale-while-revalidate: serve cached data immediately, refresh in background if stale
    if (isCacheStale(CACHE_KEY, CACHE_TTL)) {
      fetchProdutosFromDb().then((data) => setCache(CACHE_KEY, data)).catch(() => {});
    }
    return cached;
  }

  // No cache — fetch from Supabase
  const data = await fetchProdutosFromDb();
  setCache(CACHE_KEY, data);
  return data;
}

async function fetchProdutosFromDb(): Promise<DbProduto[]> {
  const { data, error } = await supabase
    .from("produtos")
    .select("id,nome,liga,time,tipo,temporada,imagem_urls,imagem_urls_feminina,yupoo_url,destaque,ordem_destaque,preco_customizado,promocao,promocao_tipo,promocao_valor,feminino,peca,cached_image_urls,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];

  const seen = new Set<string>();
  return data.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  }).map((p) => ({
    ...p,
    imagem_urls: parseImageUrls(p.imagem_urls),
    imagem_urls_feminina: parseImageUrls(p.imagem_urls_feminina),
  }));
}

/** Columns that actually exist in the Supabase 'produtos' table.
 *  If a column is missing from the DB, it will be filtered out before insert/update.
 */
const PRODUTOS_COLUMNS = new Set([
  "id", "nome", "liga", "time", "tipo", "temporada",
  "imagem_urls", "imagem_urls_feminina", "yupoo_url", "destaque", "ordem_destaque", "created_at",
  "preco_customizado", "promocao", "promocao_tipo", "promocao_valor", "peca",
  "feminino", "cached_image_urls",
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
  const CACHE_KEY = "loja_config";
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const cached = getCached<LojaConfig>(CACHE_KEY);
  if (cached) {
    // Stale-while-revalidate
    if (isCacheStale(CACHE_KEY, CACHE_TTL)) {
      fetchLojaConfigFromDb().then((data) => setCache(CACHE_KEY, data)).catch(() => {});
    }
    return cached;
  }

  const data = await fetchLojaConfigFromDb();
  setCache(CACHE_KEY, data);
  return data;
}

async function fetchLojaConfigFromDb(): Promise<LojaConfig> {
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

export async function reorderDestaques(items: { id: string; ordem_destaque: number }[]): Promise<void> {
  // Update each item's ordem_destaque individually
  for (const item of items) {
    const { error } = await supabase
      .from("produtos")
      .update({ ordem_destaque: item.ordem_destaque })
      .eq("id", item.id);

    if (error) throw error;
  }
}

export async function setPromocaoCategoria(tipo: string, ativa: boolean): Promise<void> {
  const { error } = await supabase
    .from("produtos")
    .update({ promocao: ativa })
    .eq("tipo", tipo);

  if (error) throw error;
}

/** Apply promotion to all products of a specific team */
export async function setPromocaoTime(
  time: string,
  promocaoTipo: string,
  promocaoValor: number | null,
  precoCustomizado: number | null,
): Promise<DbProduto[]> {
  const updateData: Record<string, unknown> = {
    promocao: true,
    promocao_tipo: promocaoTipo,
    promocao_valor: promocaoValor,
    preco_customizado: precoCustomizado,
  };

  const { data, error } = await supabase
    .from("produtos")
    .update(updateData)
    .eq("time", time)
    .select();

  if (error) throw error;
  return data as DbProduto[];
}

/** Remove promotion from all products of a specific team */
export async function removePromocaoTime(time: string): Promise<DbProduto[]> {
  const { data, error } = await supabase
    .from("produtos")
    .update({
      promocao: false,
      promocao_tipo: null,
      promocao_valor: null,
      preco_customizado: null,
    })
    .eq("time", time)
    .select();

  if (error) throw error;
  return data as DbProduto[];
}

/** Apply percentage discount to ALL products (site-wide) — overrides existing individual promos */
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

/** Remove all percentage-based promotions (site-wide cleanup) */
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
  pronta_entrega: boolean | null;
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
    pronta_entrega: db.pronta_entrega ?? false,
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
    pronta_entrega: order.pronta_entrega || null,
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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`/api/order/${encodeURIComponent(id)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
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

export async function updatePedidoProntaEntrega(id: string, isProntaEntrega: boolean): Promise<void> {
  const { error } = await supabase
    .from("pedidos")
    .update({ pronta_entrega: isProntaEntrega })
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

/** Auto-cancel pending orders older than `hours` (default 24h).
 *  Returns the number of orders cancelled. */
export async function autoCancelExpiredOrders(hours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("pedidos")
    .update({ status: "cancelado" })
    .eq("status", "pendente")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("Erro ao auto-cancelar pedidos expirados:", error);
    return 0;
  }
  return data?.length ?? 0;
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

// ── Estoque Pronta Entrega ──

export interface DbEstoqueItem {
  id: string;
  produto_id: string;
  tamanho: string;
  quantidade: number;
  personalizado: boolean;
  nome_personalizado: string | null;
  numero_personalizado: string | null;
  created_at: string;
}

function dbEstoqueToEstoque(db: DbEstoqueItem & { produtos?: { nome: string; imagem_urls: string[] | string; tipo: string; time: string; liga: string; temporada: string } | null }): EstoqueItem {
  const produto = db.produtos;
  return {
    id: db.id,
    produto_id: db.produto_id,
    tamanho: db.tamanho,
    quantidade: db.quantidade,
    personalizado: db.personalizado ?? false,
    nome_personalizado: db.nome_personalizado ?? undefined,
    numero_personalizado: db.numero_personalizado ?? undefined,
    created_at: db.created_at,
    produto_nome: produto?.nome ?? undefined,
    produto_imagem: produto ? parseImageUrls(produto.imagem_urls as string[] | string)[0] : undefined,
    produto_tipo: produto?.tipo ?? undefined,
    produto_time: produto?.time ?? undefined,
    produto_liga: produto?.liga ?? undefined,
    produto_temporada: produto?.temporada ?? undefined,
  };
}

const ESTOQUE_SELECT = "id, produto_id, tamanho, quantidade, personalizado, nome_personalizado, numero_personalizado, created_at, produtos(nome, imagem_urls, tipo, time, liga, temporada)";

export async function getEstoque(): Promise<EstoqueItem[]> {
  const { data, error } = await supabase
    .from("estoque_pronta_entrega")
    .select(ESTOQUE_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];
  return (data as unknown as (DbEstoqueItem & { produtos: { nome: string; imagem_urls: string[] | string; tipo: string; time: string; liga: string; temporada: string } | null })[]).map(dbEstoqueToEstoque);
}

export async function getEstoquePublico(): Promise<EstoqueItem[]> {
  const { data, error } = await supabase
    .from("estoque_pronta_entrega")
    .select(ESTOQUE_SELECT)
    .gt("quantidade", 0)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];
  return (data as unknown as (DbEstoqueItem & { produtos: { nome: string; imagem_urls: string[] | string; tipo: string; time: string; liga: string; temporada: string } | null })[]).map(dbEstoqueToEstoque);
}

export async function addEstoqueItem(
  produtoId: string,
  tamanho: string,
  quantidade: number,
  personalizado: boolean = false,
  nomePersonalizado?: string,
  numeroPersonalizado?: string,
): Promise<EstoqueItem> {
  const nomePessoal = personalizado ? (nomePersonalizado ?? null) : null;
  const numeroPessoal = personalizado ? (numeroPersonalizado ?? null) : null;

  // Check if item already exists (same product, size, and personalization)
  let query = supabase
    .from("estoque_pronta_entrega")
    .select("id, quantidade")
    .eq("produto_id", produtoId)
    .eq("tamanho", tamanho)
    .eq("personalizado", personalizado);

  if (nomePessoal) {
    query = query.eq("nome_personalizado", nomePessoal);
  } else {
    query = query.is("nome_personalizado", null);
  }
  if (numeroPessoal) {
    query = query.eq("numero_personalizado", numeroPessoal);
  } else {
    query = query.is("numero_personalizado", null);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    // Increment quantity on existing item
    const newQty = existing.quantidade + quantidade;
    const { data, error } = await supabase
      .from("estoque_pronta_entrega")
      .update({ quantidade: newQty })
      .eq("id", existing.id)
      .select(ESTOQUE_SELECT)
      .single();

    if (error) throw error;
    return dbEstoqueToEstoque(data as unknown as DbEstoqueItem & { produtos: { nome: string; imagem_urls: string[] | string; tipo: string; time: string; liga: string; temporada: string } });
  }

  // Insert new item
  const { data, error } = await supabase
    .from("estoque_pronta_entrega")
    .insert({
      produto_id: produtoId,
      tamanho,
      quantidade,
      personalizado,
      nome_personalizado: nomePessoal,
      numero_personalizado: numeroPessoal,
    })
    .select(ESTOQUE_SELECT)
    .single();

  if (error) throw error;
  return dbEstoqueToEstoque(data as unknown as DbEstoqueItem & { produtos: { nome: string; imagem_urls: string[] | string; tipo: string; time: string; liga: string; temporada: string } });
}

export async function updateEstoqueItem(id: string, quantidade: number): Promise<void> {
  const { error } = await supabase
    .from("estoque_pronta_entrega")
    .update({ quantidade })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteEstoqueItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("estoque_pronta_entrega")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

/** Add items from a delivered order to estoque (for pronta_entrega orders).
 *  Considers personalization when matching existing stock entries. */
export async function addOrderItemsToEstoque(order: import("../types").Order): Promise<void> {
  for (const item of order.itens) {
    // Find the product by name to get the produto_id
    const { data: produtos } = await supabase
      .from("produtos")
      .select("id")
      .eq("nome", item.nome)
      .limit(1);

    if (produtos && produtos.length > 0) {
      const produtoId = produtos[0].id;
      const isPersonalizado = item.personalizado ?? false;
      const nomePessoal = isPersonalizado ? (item.nomePersonalizado ?? null) : null;
      const numeroPessoal = isPersonalizado ? (item.numeroPersonalizado ?? null) : null;

      // Match by product, size, and personalization
      let query = supabase
        .from("estoque_pronta_entrega")
        .select("id, quantidade")
        .eq("produto_id", produtoId)
        .eq("tamanho", item.tamanho)
        .eq("personalizado", isPersonalizado);

      if (nomePessoal) {
        query = query.eq("nome_personalizado", nomePessoal);
      } else {
        query = query.is("nome_personalizado", null);
      }
      if (numeroPessoal) {
        query = query.eq("numero_personalizado", numeroPessoal);
      } else {
        query = query.is("numero_personalizado", null);
      }

      const { data: existing } = await query.maybeSingle();

      if (existing) {
        await supabase
          .from("estoque_pronta_entrega")
          .update({ quantidade: existing.quantidade + 1 })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("estoque_pronta_entrega")
          .insert({
            produto_id: produtoId,
            tamanho: item.tamanho,
            quantidade: 1,
            personalizado: isPersonalizado,
            nome_personalizado: nomePessoal,
            numero_personalizado: numeroPessoal,
          });
      }
    }
  }
}

/** Decrement stock quantity for a pronta entrega item.
 *  Called when a customer buys from pronta entrega.
 *  Returns true if the stock was successfully decremented. */
export async function decrementEstoqueItem(
  produtoId: string,
  tamanho: string,
  personalizado: boolean = false,
  nomePersonalizado?: string,
  numeroPersonalizado?: string,
): Promise<boolean> {
  const nomePessoal = personalizado ? (nomePersonalizado ?? null) : null;
  const numeroPessoal = personalizado ? (numeroPersonalizado ?? null) : null;

  // Find the matching stock entry
  let query = supabase
    .from("estoque_pronta_entrega")
    .select("id, quantidade")
    .eq("produto_id", produtoId)
    .eq("tamanho", tamanho)
    .eq("personalizado", personalizado);

  if (nomePessoal) {
    query = query.eq("nome_personalizado", nomePessoal);
  } else {
    query = query.is("nome_personalizado", null);
  }
  if (numeroPessoal) {
    query = query.eq("numero_personalizado", numeroPessoal);
  } else {
    query = query.is("numero_personalizado", null);
  }

  const { data: existing } = await query.maybeSingle();
  if (!existing || existing.quantidade <= 0) return false;

  const newQty = existing.quantidade - 1;
  const { error } = await supabase
    .from("estoque_pronta_entrega")
    .update({ quantidade: newQty })
    .eq("id", existing.id);

  return !error;
}

/** Register a direct sale (venda direta/boca a boca) from admin.
 *  Decrements stock and creates a completed order automatically.
 *  The order goes through: pago → entregue (via DB RPC to bypass trigger). */
export async function criarVendaDireta(
  items: { produtoId: string; nome: string; tipo: string; temporada: string; tamanho: string; preco: number; personalizado: boolean; nomePersonalizado?: string; numeroPersonalizado?: string }[],
  nomeCliente: string,
): Promise<import("../types").Order> {
  const now = new Date();
  const data = now.toLocaleDateString("pt-BR");
  const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const total = items.reduce((sum, i) => sum + i.preco, 0);

  // Generate a unique order ID
  const { gerarId } = await import("../types");
  const orderId = gerarId();

  const orderItens: OrderItem[] = items.map((item) => ({
    nome: item.nome,
    tipo: item.tipo,
    temporada: item.temporada,
    tamanho: item.tamanho,
    genero: "Masculino",
    personalizado: item.personalizado,
    nomePersonalizado: item.nomePersonalizado,
    numeroPersonalizado: item.numeroPersonalizado,
    preco: item.preco,
    yupooUrl: "",
    feminino: false,
  }));

  // Create order as "pago" (DB trigger only accepts "pendente" or "pago" on INSERT)
  const order: import("../types").Order = {
    id: orderId,
    data,
    hora,
    itens: orderItens,
    total,
    status: "pago",
    endereco: {
      nome: nomeCliente,
      rua: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      estado: "",
      cep: "",
      telefone: "",
      deliveryMethod: "retirada",
    },
    admin_order: true,
    pronta_entrega: true,
  };

  // Create the order (status = "pago")
  const saved = await createPedido(order);

  // Step through status transitions to "entregue" via RPC (bypasses trigger)
  // If RPC doesn't exist, we use the direct_sale_entregue RPC, otherwise step manually
  const { error: rpcError } = await supabase.rpc("venda_direta_entregue", { pedido_id: orderId });

  if (rpcError) {
    // RPC doesn't exist yet — try stepping through transitions manually
    // pago → enviado_fornecedor → em_producao → a_caminho → em_estoque → em_entrega → entregue
    const steps = ["enviado_fornecedor", "em_producao", "a_caminho", "em_estoque", "em_entrega", "entregue"];
    for (const step of steps) {
      const { error } = await supabase.from("pedidos").update({ status: step }).eq("id", orderId);
      if (error) {
        console.error(`Erro ao avançar status para ${step}:`, error.message);
        break;
      }
    }
  }

  // Decrement stock for each item
  for (const item of items) {
    await decrementEstoqueItem(
      item.produtoId,
      item.tamanho,
      item.personalizado,
      item.nomePersonalizado,
      item.numeroPersonalizado,
    );
  }

  return { ...saved, status: "entregue", pronta_entrega: true };
}

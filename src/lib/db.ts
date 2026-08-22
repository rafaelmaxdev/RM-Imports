import { supabase } from "./supabase";
import type { LojaConfig, OrderItem, OrderAddress, CachedImageMap, EstoqueItem, Cupom } from "../types";
import { DEFAULT_CONFIG } from "../types";
import { getCached, setCache, isCacheStale } from "./cache";
import { getOrderAccessToken, saveOrderAccessToken } from "./orderAccess";

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
      fetchProdutosFromDb().then((data) => setCache(CACHE_KEY, data)).catch((err) => console.warn("[db] background refresh produtos failed:", err));
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
      fetchLojaConfigFromDb().then((data) => setCache(CACHE_KEY, data)).catch((err) => console.warn("[db] background refresh config failed:", err));
    }
    return cached;
  }

  const data = await fetchLojaConfigFromDb();
  setCache(CACHE_KEY, data);
  return data;
}

async function fetchLojaConfigFromDb(): Promise<LojaConfig> {
  const { data, error } = await supabase
    .from("loja_config_publico")
    .select("key, value");

  if (error) throw error;
  if (!data) return DEFAULT_CONFIG;

  return configFromRows(data);
}

function configFromRows(data: { key: string; value: unknown }[]): LojaConfig {

  const config = { ...DEFAULT_CONFIG };
  for (const row of data) {
    if (row.key === "precos_base" && typeof row.value === "object") {
      config.precos_base = row.value as Record<string, number>;
    } else if (row.key === "precos_promocao" && typeof row.value === "object") {
      config.precos_promocao = row.value as Record<string, number>;
    } else if (row.key === "promocao_ativa" && typeof row.value === "object") {
      config.promocao_ativa = row.value as Record<string, boolean>;
    } else if (row.key === "desconto_global") {
      config.desconto_global = row.value as number | null;
    } else if (row.key === "promocoes_time" && typeof row.value === "object") {
      config.promocoes_time = row.value as Record<string, { tipo: string; valor: number | null; preco: number | null }>;
    } else if (row.key === "pronta_entrega_markup") {
      config.pronta_entrega_markup = row.value as number;
    } else if (row.key === "custo_base" && typeof row.value === "object") {
      config.custo_base = row.value as Record<string, number>;
    } else if (row.key === "personalizacao_custo" && typeof row.value === "object") {
      config.personalizacao_custo = row.value as Record<string, number>;
    }
  }
  return config;
}

export async function getAdminLojaConfig(): Promise<LojaConfig> {
  const { data, error } = await supabase.from("loja_config").select("key, value");
  if (error) throw error;
  return data ? configFromRows(data) : DEFAULT_CONFIG;
}

export async function updateLojaConfig(
  key: "precos_base" | "precos_promocao" | "promocao_ativa" | "desconto_global" | "promocoes_time" | "pronta_entrega_markup" | "custo_base" | "personalizacao_custo",
  value: Record<string, number> | Record<string, boolean> | number | null | Record<string, { tipo: string; valor: number | null; preco: number | null }>,
): Promise<void> {
  const { error } = await supabase
    .from("loja_config")
    .upsert({ key, value }, { onConflict: "key" });

  if (error) throw error;
  const { clearCache } = await import("./cache");
  clearCache("loja_config");
}

export async function toggleDestaque(id: string, destaque: boolean): Promise<void> {
  const { error } = await supabase
    .from("produtos")
    .update({ destaque })
    .eq("id", id);

  if (error) throw error;
}

export async function reorderDestaques(items: { id: string; ordem_destaque: number }[]): Promise<void> {
  const promises = items.map((item) =>
    supabase.from("produtos").update({ ordem_destaque: item.ordem_destaque }).eq("id", item.id)
  );
  const results = await Promise.all(promises);
  for (const { error } of results) {
    if (error) throw error;
  }
}

/** Apply promotion to all products of a specific team — stored in loja_config */
export async function setPromocaoTime(
  time: string,
  promocaoTipo: string,
  promocaoValor: number | null,
  precoCustomizado: number | null,
): Promise<void> {
  const { data: configData } = await supabase.from("loja_config").select("value").eq("key", "promocoes_time").single();
  const current = configData?.value as Record<string, { tipo: string; valor: number | null; preco: number | null }> | null ?? {};
  current[time] = { tipo: promocaoTipo, valor: promocaoValor, preco: precoCustomizado };
  const { error } = await supabase.from("loja_config").upsert({ key: "promocoes_time", value: current }, { onConflict: "key" });
  if (error) throw error;
  const { clearCache } = await import("./cache");
  clearCache("loja_config");
}

/** Remove promotion from all products of a specific team */
export async function removePromocaoTime(time: string): Promise<void> {
  const { data: configData } = await supabase.from("loja_config").select("value").eq("key", "promocoes_time").single();
  const current = configData?.value as Record<string, { tipo: string; valor: number | null; preco: number | null }> | null ?? {};
  delete current[time];
  const { error } = await supabase.from("loja_config").upsert({ key: "promocoes_time", value: current }, { onConflict: "key" });
  if (error) throw error;
  const { clearCache } = await import("./cache");
  clearCache("loja_config");
}

/** Apply percentage discount to ALL products (site-wide) — stored in loja_config */
export async function setDescontoGlobal(porcentagem: number): Promise<void> {
  const { error } = await supabase.from("loja_config").upsert({ key: "desconto_global", value: porcentagem }, { onConflict: "key" });
  if (error) throw error;
  const { clearCache } = await import("./cache");
  clearCache("loja_config");
}

/** Remove site-wide discount */
export async function removeDescontoGlobal(): Promise<void> {
  const { error } = await supabase.from("loja_config").upsert({ key: "desconto_global", value: null }, { onConflict: "key" });
  if (error) throw error;
  const { clearCache } = await import("./cache");
  clearCache("loja_config");
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
  reposicao: boolean | null;
  cupom_codigo?: string | null;
  cupom_desconto?: number | null;
  telefone_normalizado?: string | null;
  cupom_id?: string | null;
  influenciador_handle?: string | null;
  rev_share_percentual?: number | null;
  valor_base_comissao?: number | null;
  comissao_calculada?: number | null;
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
    reposicao: db.reposicao ?? false,
    cupom_codigo: db.cupom_codigo ?? undefined,
    cupom_desconto: db.cupom_desconto ?? undefined,
    telefone_normalizado: db.telefone_normalizado ?? undefined,
    cupom_id: db.cupom_id ?? undefined,
    influenciador_handle: db.influenciador_handle ?? undefined,
    rev_share_percentual: db.rev_share_percentual ?? undefined,
    valor_base_comissao: db.valor_base_comissao ?? undefined,
    comissao_calculada: db.comissao_calculada ?? undefined,
    created_at: db.created_at,
  };
}

export async function getProdutosByIds(ids: string[]): Promise<DbProduto[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  return (data as DbProduto[]) ?? [];
}

export async function getPedidos(): Promise<import("../types").Order[]> {
  const CACHE_KEY = "pedidos";
  const CACHE_TTL = 30 * 1000;

  const cached = getCached<import("../types").Order[]>(CACHE_KEY);
  if (cached) {
    if (isCacheStale(CACHE_KEY, CACHE_TTL)) {
      fetchPedidosFromDb().then((data) => setCache(CACHE_KEY, data)).catch((err) => console.warn("[db] background refresh pedidos failed:", err));
    }
    return cached;
  }

  const data = await fetchPedidosFromDb();
  setCache(CACHE_KEY, data);
  return data;
}

async function fetchPedidosFromDb(): Promise<import("../types").Order[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];
  return (data as DbPedido[]).map(dbPedidoToOrder);
}

export async function getPedidoById(id: string, phone?: string): Promise<import("../types").Order | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const orderAccessToken = getOrderAccessToken(id);
    const query = phone ? `?phone=${encodeURIComponent(phone)}` : "";
    const res = await fetch(`/api/order/${encodeURIComponent(id)}${query}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(orderAccessToken ? { "X-Order-Token": orderAccessToken } : {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch order: ${res.status}`);
    const data = await res.json();
    if (typeof data.orderAccessToken === "string") saveOrderAccessToken(id, data.orderAccessToken);
    return {
      ...data,
      itens: data.itens ? (typeof data.itens === "string" ? JSON.parse(data.itens) : data.itens) : [],
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
  if (["cancelado", "reembolsado"].includes(status)) {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/order/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error || "Erro ao finalizar pedido.");
    }
    return;
  }

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

// ── Pacotes ──

export interface DbPacote {
  id: string;
  status: string;
  custo: number | null;
  frete: number | null;
  taxa_importacao: number | null;
  dolar_rate: number | null;
  pedido_ids: string; // JSONB stored as string from Supabase
  created_at: string;
}

export interface Pacote {
  id: string;
  status: string;
  custo: number | null;
  frete: number | null;
  taxa_importacao: number | null;
  dolar_rate: number | null;
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
    dolar_rate: db.dolar_rate,
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
    dolar_rate: null,
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
  financeiro: { custo: number | null; frete: number | null; taxa_importacao: number | null; dolar_rate?: number | null }
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
  feminino: boolean;
  custo: number | null;
  created_at: string;
}

function dbEstoqueToEstoque(db: DbEstoqueItem & { produtos?: { nome: string; imagem_urls: string[] | string; imagem_urls_feminina?: string[] | string | null; cached_image_urls?: CachedImageMap | null; tipo: string; time: string; liga: string; temporada: string } | null; custo?: number | null }): EstoqueItem {
  const produto = db.produtos;
  const feminineImages = produto?.imagem_urls_feminina ? parseImageUrls(produto.imagem_urls_feminina) : [];
  const masculineImages = produto ? parseImageUrls(produto.imagem_urls as string[] | string) : [];
  const cachedUrls = produto?.cached_image_urls;
  return {
    id: db.id,
    produto_id: db.produto_id,
    tamanho: db.tamanho,
    quantidade: db.quantidade,
    personalizado: db.personalizado ?? false,
    nome_personalizado: db.nome_personalizado ?? undefined,
    numero_personalizado: db.numero_personalizado ?? undefined,
    feminino: db.feminino,
    custo: db.custo ?? undefined,
    created_at: db.created_at,
    produto_nome: produto?.nome ?? undefined,
    produto_imagem: db.feminino && feminineImages.length > 0 ? feminineImages[0] : (masculineImages[0] ?? undefined),
    produto_imagens_femininas: feminineImages.length > 0 ? feminineImages : undefined,
    produto_tipo: produto?.tipo ?? undefined,
    produto_time: produto?.time ?? undefined,
    produto_liga: produto?.liga ?? undefined,
    produto_temporada: produto?.temporada ?? undefined,
    produto_cached_image_urls: cachedUrls ?? undefined,
  };
}

const ESTOQUE_SELECT = "id, produto_id, tamanho, quantidade, personalizado, nome_personalizado, numero_personalizado, feminino, custo, created_at, produtos(nome, imagem_urls, imagem_urls_feminina, cached_image_urls, tipo, time, liga, temporada)";
const ESTOQUE_PUBLICO_SELECT = "id, produto_id, tamanho, quantidade, personalizado, nome_personalizado, numero_personalizado, feminino, created_at, produtos";

export async function getEstoque(): Promise<EstoqueItem[]> {
  const { data, error } = await supabase
    .from("estoque_pronta_entrega")
    .select(ESTOQUE_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];
  const typed1 = data as unknown as (DbEstoqueItem & { produtos: { nome: string; imagem_urls: string[] | string; imagem_urls_feminina?: string[] | string | null; tipo: string; time: string; liga: string; temporada: string } | null })[];
  return typed1.map(dbEstoqueToEstoque);
}

export async function getEstoquePublico(): Promise<EstoqueItem[]> {
  const { data, error } = await supabase
    .from("estoque_publico")
    .select(ESTOQUE_PUBLICO_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];
  const typedPublico = data as unknown as (DbEstoqueItem & { produtos: { nome: string; imagem_urls: string[] | string; imagem_urls_feminina?: string[] | string | null; tipo: string; time: string; liga: string; temporada: string } | null })[];
  return typedPublico.map(dbEstoqueToEstoque);
}

export async function addEstoqueItem(
  produtoId: string,
  tamanho: string,
  quantidade: number,
  personalizado: boolean = false,
  nomePersonalizado?: string,
  numeroPersonalizado?: string,
  feminino: boolean = false,
  custo?: number | null,
): Promise<EstoqueItem> {
  const nomePessoal = personalizado ? (nomePersonalizado ?? null) : null;
  const numeroPessoal = personalizado ? (numeroPersonalizado ?? null) : null;

  let query = supabase
    .from("estoque_pronta_entrega")
    .select("id, quantidade")
    .eq("produto_id", produtoId)
    .eq("tamanho", tamanho)
    .eq("personalizado", personalizado)
    .eq("feminino", feminino);

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
    const newQty = existing.quantidade + quantidade;
    const { error } = await supabase
      .from("estoque_pronta_entrega")
      .update({ quantidade: newQty })
      .eq("id", existing.id);

    if (error) throw error;

    const { data, error: fetchError } = await supabase
      .from("estoque_pronta_entrega")
      .select(ESTOQUE_SELECT)
      .eq("id", existing.id)
      .single();

    if (fetchError) throw fetchError;
    return dbEstoqueToEstoque(data as unknown as DbEstoqueItem & { produtos: { nome: string; imagem_urls: string[] | string; imagem_urls_feminina?: string[] | string | null; tipo: string; time: string; liga: string; temporada: string } });
  }

  const { error } = await supabase
    .from("estoque_pronta_entrega")
    .insert({
      produto_id: produtoId,
      tamanho,
      quantidade,
      personalizado,
      nome_personalizado: nomePessoal,
      numero_personalizado: numeroPessoal,
      feminino,
      custo: custo ?? null,
    });

  if (error) throw error;

  let fetchQuery = supabase
    .from("estoque_pronta_entrega")
    .select(ESTOQUE_SELECT)
    .eq("produto_id", produtoId)
    .eq("tamanho", tamanho)
    .eq("personalizado", personalizado)
    .eq("feminino", feminino);

  if (nomePessoal) {
    fetchQuery = fetchQuery.eq("nome_personalizado", nomePessoal);
  } else {
    fetchQuery = fetchQuery.is("nome_personalizado", null);
  }
  if (numeroPessoal) {
    fetchQuery = fetchQuery.eq("numero_personalizado", numeroPessoal);
  } else {
    fetchQuery = fetchQuery.is("numero_personalizado", null);
  }

  const { data, error: fetchError } = await fetchQuery.single();
  if (fetchError) throw fetchError;
  return dbEstoqueToEstoque(data as unknown as DbEstoqueItem & { produtos: { nome: string; imagem_urls: string[] | string; imagem_urls_feminina?: string[] | string | null; tipo: string; time: string; liga: string; temporada: string } });
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

export async function addOrderItemsToEstoque(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("receive_replenishment_order", {
    p_order_id: orderId,
  });
  if (error) throw error;
}

/** Register a direct sale (venda direta/boca a boca) from admin. */
export async function criarVendaDireta(
  items: { produtoId: string; nome: string; tipo: string; temporada: string; tamanho: string; preco: number; personalizado: boolean; nomePersonalizado?: string; numeroPersonalizado?: string; feminino?: boolean }[],
  nomeCliente: string,
  paymentMethod?: string,
): Promise<import("../types").Order> {
  const { gerarId } = await import("../types");
  const orderId = gerarId();

  const { data, error } = await supabase.rpc("create_direct_sale", {
    p_order_id: orderId,
    p_items: items,
    p_customer_name: nomeCliente,
    p_payment_method: paymentMethod ?? "pix",
  });

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Venda direta não retornou um pedido.");
  return dbPedidoToOrder(data[0] as DbPedido);
}

// ── Cupons ──

export async function getCupons(): Promise<Cupom[]> {
  const { data, error } = await supabase
    .from("cupons")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Cupom[]) ?? [];
}

type NovoCupom = Omit<Cupom, "id" | "usos_atuais" | "created_at"> &
  Required<Pick<Cupom, "uso_unico_por_cliente" | "influenciador" | "influenciador_handle" | "rev_share_percentual" | "observacao_interna">>;

export async function createCupom(cupom: NovoCupom): Promise<Cupom> {
  const { data, error } = await supabase
    .from("cupons")
    .insert({ ...cupom, usos_atuais: 0 })
    .select()
    .single();
  if (error) throw error;
  return data as Cupom;
}

export async function updateCupom(id: string, updates: Partial<Cupom>): Promise<void> {
  const { error } = await supabase.from("cupons").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteCupom(id: string): Promise<void> {
  const { error } = await supabase.from("cupons").delete().eq("id", id);
  if (error) throw error;
}

export async function validarCupom(codigo: string, totalPedido: number): Promise<Cupom | null> {
  try {
    const res = await fetch("/api/coupon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codigo, total: totalPedido }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Cupom;
  } catch {
    return null;
  }
}

export function aplicarCupom(total: number, cupom: Cupom): number {
  if (cupom.tipo === "porcentagem") {
    const desconto = total * (cupom.valor / 100);
    const capped = cupom.desconto_maximo !== null ? Math.min(desconto, cupom.desconto_maximo) : desconto;
    return Math.max(0, Math.round((total - capped) * 100) / 100);
  }
  return Math.max(0, Math.round((total - cupom.valor) * 100) / 100);
}

export async function getCupomRevenue(codigo: string): Promise<{
  descontos: number;
  pedidos: number;
  faturamento: number;
  comissao: number;
}> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("total,cupom_desconto,comissao_calculada")
    .eq("cupom_codigo", codigo.toUpperCase().trim())
    .not("status", "in", `("cancelado","reembolsado","pendente")`);
  if (error) return { descontos: 0, pedidos: 0, faturamento: 0, comissao: 0 };
  type CupomRevenueRow = {
    total: number | null;
    cupom_desconto: number | null;
    comissao_calculada: number | null;
  };
  const pedidos = (data as CupomRevenueRow[] | null) ?? [];
  return {
    descontos: pedidos.reduce((s, p) => s + Number(p.cupom_desconto ?? 0), 0),
    pedidos: pedidos.length,
    faturamento: pedidos.reduce((s, p) => s + Number(p.total ?? 0), 0),
    comissao: pedidos.reduce((s, p) => s + Number(p.comissao_calculada ?? 0), 0),
  };
}

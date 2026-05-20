import { supabase } from "./supabase";
import type { LojaConfig } from "../types";
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
  promocao_tipo: string | null;   // 'porcentagem' | 'novo_preco' | 'leve_pague' | null
  promocao_valor: number | null;  // percentage for 'porcentagem', null for others
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
    .select("*")
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

export async function addProduto(p: Omit<DbProduto, "id" | "created_at">): Promise<DbProduto> {
  const { data, error } = await supabase
    .from("produtos")
    .insert(p)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProduto(id: string, p: Partial<Omit<DbProduto, "id" | "created_at">>): Promise<DbProduto> {
  const { data, error } = await supabase
    .from("produtos")
    .update(p)
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

export async function updateProdutoCustomPrice(id: string, preco_customizado: number | null): Promise<void> {
  const { error } = await supabase
    .from("produtos")
    .update({ preco_customizado })
    .eq("id", id);

  if (error) throw error;
}

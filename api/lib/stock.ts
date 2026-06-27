import type { SupabaseClient } from "@supabase/supabase-js";

interface StockItem {
  nome: string;
  tamanho: string;
  personalizado?: boolean;
  nomePersonalizado?: string | null;
  numeroPersonalizado?: string | null;
  feminino?: boolean;
}

/** Batch-fetch product IDs by name, returns a Map<nome, id>. */
export async function getProdutoMap(
  supabase: SupabaseClient,
  nomes: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(nomes)];
  const { data } = await supabase.from("produtos").select("id, nome").in("nome", unique);
  const map = new Map<string, string>();
  for (const row of data || []) {
    map.set((row as any).nome, (row as any).id);
  }
  return map;
}

/** Build a Supabase query to find a stock item by its attributes. */
function buildStockQuery(
  supabase: SupabaseClient,
  produtoId: string,
  item: StockItem,
) {
  const isPersonalizado = item.personalizado ?? false;
  const nomePessoal = isPersonalizado ? (item.nomePersonalizado ?? null) : null;
  const numeroPessoal = isPersonalizado ? (item.numeroPersonalizado ?? null) : null;
  const isFeminino = item.feminino ?? false;

  let query = supabase
    .from("estoque_pronta_entrega")
    .select("id, quantidade")
    .eq("produto_id", produtoId)
    .eq("tamanho", item.tamanho)
    .eq("personalizado", isPersonalizado)
    .eq("feminino", isFeminino);

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

  return query;
}

/** Restore stock for a list of items (add 1 to each). */
export async function restoreStock(
  supabase: SupabaseClient,
  items: StockItem[],
  produtoMap: Map<string, string>,
): Promise<void> {
  for (const item of items) {
    const produtoId = produtoMap.get(item.nome);
    if (!produtoId) continue;

    const query = buildStockQuery(supabase, produtoId, item);
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      await supabase
        .from("estoque_pronta_entrega")
        .update({ quantidade: (existing as any).quantidade + 1 })
        .eq("id", (existing as any).id);
    } else {
      const isPersonalizado = item.personalizado ?? false;
      await supabase.from("estoque_pronta_entrega").insert({
        produto_id: produtoId,
        tamanho: item.tamanho,
        quantidade: 1,
        personalizado: isPersonalizado,
        nome_personalizado: isPersonalizado ? (item.nomePersonalizado ?? null) : null,
        numero_personalizado: isPersonalizado ? (item.numeroPersonalizado ?? null) : null,
        feminino: item.feminino ?? false,
      });
    }
  }
}

/** Decrement stock for a list of items (remove 1 from each). */
export async function decrementStock(
  supabase: SupabaseClient,
  items: StockItem[],
  produtoMap: Map<string, string>,
): Promise<void> {
  for (const item of items) {
    const produtoId = produtoMap.get(item.nome);
    if (!produtoId) continue;

    const query = buildStockQuery(supabase, produtoId, item);
    const { data: existing } = await query.maybeSingle();
    if (!existing || (existing as any).quantidade <= 0) continue;

    await supabase
      .from("estoque_pronta_entrega")
      .update({ quantidade: (existing as any).quantidade - 1 })
      .eq("id", (existing as any).id);
  }
}

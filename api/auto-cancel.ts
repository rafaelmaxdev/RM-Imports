import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function autoCancelExpiredOrders(hours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data: expired, error: fetchError } = await supabase
    .from("pedidos")
    .select("id, itens, pronta_entrega")
    .eq("status", "pendente")
    .lt("created_at", cutoff);

  if (fetchError || !expired) return 0;

  const nomes = [...new Set(expired.flatMap((o: any) => {
    if (!o.pronta_entrega || !o.itens) return [];
    const itens = typeof o.itens === "string" ? JSON.parse(o.itens) : o.itens;
    return itens.map((i: any) => i.nome);
  }))];
  const { data: produtosBatch } = await supabase.from("produtos").select("id, nome").in("nome", nomes);
  const produtoMap = new Map((produtosBatch || []).map((p: any) => [p.nome, p.id]));

  for (const order of expired) {
    if (order.pronta_entrega && order.itens) {
      const itens = typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens;
      for (const item of itens) {
        const produtoId = produtoMap.get(item.nome);
        if (!produtoId) continue;
        const isPersonalizado = item.personalizado ?? false;
        const nomePessoal = isPersonalizado ? (item.nomePersonalizado ?? null) : null;
        const numeroPessoal = isPersonalizado ? (item.numeroPersonalizado ?? null) : null;
        const isFeminino = item.feminino ?? false;
        let query = supabase.from("estoque_pronta_entrega").select("id, quantidade").eq("produto_id", produtoId).eq("tamanho", item.tamanho).eq("personalizado", isPersonalizado).eq("feminino", isFeminino);
        if (nomePessoal) query = query.eq("nome_personalizado", nomePessoal); else query = query.is("nome_personalizado", null);
        if (numeroPessoal) query = query.eq("numero_personalizado", numeroPessoal); else query = query.is("numero_personalizado", null);
        const { data: existing } = await query.maybeSingle();
        if (existing) {
          await supabase.from("estoque_pronta_entrega").update({ quantidade: existing.quantidade + 1 }).eq("id", existing.id);
        } else {
          await supabase.from("estoque_pronta_entrega").insert({ produto_id: produtoId, tamanho: item.tamanho, quantidade: 1, personalizado: isPersonalizado, nome_personalizado: nomePessoal, numero_personalizado: numeroPessoal, feminino: isFeminino });
        }
      }
    }
  }

  const { error } = await supabase
    .from("pedidos")
    .update({ status: "cancelado" })
    .eq("status", "pendente")
    .lt("created_at", cutoff);

  return error ? 0 : expired.length;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && token !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const cancelled = await autoCancelExpiredOrders(24);
    console.log(`[auto-cancel] ${cancelled} order(s) cancelled`);
    return res.status(200).json({ cancelled });
  } catch (err) {
    console.error("[auto-cancel] Error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

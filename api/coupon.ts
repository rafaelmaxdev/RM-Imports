import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { normalizeBrazilPhone } from "../server/lib/checkout.js";
import { clientIp, consumeRateLimit } from "../server/lib/security.js";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

interface CouponRow {
  id: string;
  codigo: string;
  tipo: "porcentagem" | "fixo";
  valor: number;
  desconto_maximo: number | null;
  uso_maximo: number | null;
  usos_atuais: number;
  valor_minimo_pedido: number | null;
  data_expiracao: string | null;
  ativo: boolean;
  created_at: string;
  uso_unico_por_cliente?: boolean;
  telefones_sem_limite?: string[];
  influenciador?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!supabase) return res.status(500).json({ error: "Serviço indisponível." });
  const ip = clientIp(req.headers, req.socket.remoteAddress);
  if (!await consumeRateLimit(supabase, "coupon", ip, 10, 60)) {
    return res.status(429).json({ error: "Muitas requisições. Aguarde um momento." });
  }

  if (!isObject(req.body)) return res.status(400).json({ error: "Dados inválidos." });

  const { code, total, phone: phoneRaw } = req.body;
  if (typeof code !== "string" || code.length > 50 || !code.trim()) {
    return res.status(400).json({ error: "Código do cupom inválido." });
  }
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
    return res.status(400).json({ error: "Total inválido." });
  }

  if (typeof phoneRaw !== "string") {
    return res.status(400).json({ error: "Informe um telefone válido para verificar o cupom." });
  }
  let telefone: string;
  try {
    telefone = normalizeBrazilPhone(phoneRaw);
  } catch {
    return res.status(400).json({ error: "Informe um telefone válido para verificar o cupom." });
  }

  const codigo = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from("cupons")
    .select("id,codigo,tipo,valor,desconto_maximo,uso_maximo,usos_atuais,valor_minimo_pedido,data_expiracao,ativo,created_at,uso_unico_por_cliente,telefones_sem_limite,influenciador")
    .eq("codigo", codigo)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    console.error("[api/coupon] failed to load coupon");
    return res.status(500).json({ error: "Não foi possível validar o cupom." });
  }
  if (!data) return res.status(404).json({ error: "Cupom inválido ou expirado." });

  const coupon = data as CouponRow;
  if (coupon.uso_maximo !== null && coupon.usos_atuais >= coupon.uso_maximo) {
    return res.status(404).json({ error: "Cupom inválido ou expirado." });
  }
  if (coupon.valor_minimo_pedido !== null && total < coupon.valor_minimo_pedido) {
    return res.status(404).json({ error: "Cupom inválido para este pedido." });
  }
  if (coupon.data_expiracao && new Date(coupon.data_expiracao).getTime() <= Date.now()) {
    return res.status(404).json({ error: "Cupom inválido ou expirado." });
  }

  if (coupon.uso_unico_por_cliente && !coupon.telefones_sem_limite?.includes(telefone)) {
    const { data: usage, error: usageError } = await supabase
      .from("cupom_utilizacoes")
      .select("id")
      .eq("cupom_id", coupon.id)
      .eq("telefone_normalizado", telefone)
      .in("status", ["reservado", "confirmado"])
      .limit(1);

    if (usageError) {
      console.error("[api/coupon] failed to load coupon usage");
      return res.status(500).json({ error: "Não foi possível validar o cupom." });
    }
    if (usage?.length) {
      return res.status(409).json({ error: "Este cupom já foi utilizado por este telefone." });
    }
  }

  return res.status(200).json({
    id: coupon.id,
    codigo: coupon.codigo,
    tipo: coupon.tipo,
    valor: coupon.valor,
    desconto_maximo: coupon.desconto_maximo,
    uso_maximo: coupon.uso_maximo,
    usos_atuais: coupon.usos_atuais,
    valor_minimo_pedido: coupon.valor_minimo_pedido,
    data_expiracao: coupon.data_expiracao,
    ativo: coupon.ativo,
    created_at: coupon.created_at,
    uso_unico_por_cliente: coupon.uso_unico_por_cliente ?? false,
    influenciador: coupon.influenciador ?? false,
  });
}

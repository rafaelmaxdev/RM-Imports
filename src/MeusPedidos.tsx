import { useState, useMemo, useEffect } from "react";
import { formatarMoeda } from "./types";
import { STATUS_CONFIG } from "./lib/status";
import type { Order } from "./types";

const STATUS_PRIORITY: Record<string, number> = {
  pendente: 0, pago: 1, enviado_fornecedor: 2, em_producao: 3,
  a_caminho: 4, em_estoque: 5, em_entrega: 6, entregue: 7,
};

export default function MeusPedidos() {
  useEffect(() => {
    document.title = "Acompanhar Pedido — RM Imports";
    document.querySelector('meta[name="description"]')?.setAttribute("content", "Acompanhe o status do seu pedido na RM Imports.");
  }, []);
  const [busca, setBusca] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  const active = useMemo(() => {
    const filtered = orders.filter((o) => o.status !== "cancelado" && o.status !== "reembolsado");
    if (filtroStatus) return filtered.filter((o) => o.status === filtroStatus);
    return filtered.sort((a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99));
  }, [orders, filtroStatus]);

  const statusOptions = useMemo(() => {
    const set = new Set(orders.map((o) => o.status));
    return [...set].filter((s) => s !== "cancelado" && s !== "reembolsado");
  }, [orders]);

  async function handleSearch() {
    const q = busca.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setOrders([]);
    setFiltroStatus("");

    try {
      const digits = q.replace(/\D/g, "");
      const up = q.toUpperCase();

      if (up.startsWith("UL-")) {
        const res = await fetch(`/api/order/${encodeURIComponent(up)}`);
        if (res.ok) {
          const data = await res.json();
          setOrders(Array.isArray(data) ? (data as Order[]) : [data as Order]);
          setLoading(false);
          return;
        }
      }

      if (digits.length > 0 && digits.length < 10 && !up.startsWith("UL-")) {
        setError("Telefone inválido ou incompleto. Informe o DDD + número (ex: 81999999999).");
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (digits.length >= 10) params.set("phone", digits);
      else if (digits.length > 0) params.set("payment", digits);
      if (params.toString()) {
        const res = await fetch(`/api/order-search?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setOrders(data as Order[]);
            setLoading(false);
            return;
          }
        } else {
          const errBody = await res.json().catch(() => ({}));
          console.log("[MP] API error:", res.status, errBody);
        }
      }

      setError("Nenhum pedido encontrado.");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function podePagar(order: Order): boolean {
    if (order.status !== "pendente" || !order.mp_preference_id) return false;
    if (!order.created_at) return true;
    const horas = (Date.now() - new Date(order.created_at).getTime()) / 36e5;
    return horas < 24;
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-16">
      <h2 className="text-xl font-bold text-primary mb-2">Meu Pedido</h2>
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700 mb-2 leading-relaxed">
        🔍 Busque por ID do pedido, telefone com DDD (ex: 81999999999) ou ID do pagamento.<br />
        💳 Se houver pedidos pendentes, aparece o botão "Pagar Agora".
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="ID do pedido, telefone ou ID do pagamento"
          className="flex-1 min-w-0 px-3 py-2.5 text-sm border border-border rounded-md bg-card-bg"
        />
        <button
          className="shrink-0 px-5 py-2.5 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
          onClick={handleSearch}
          disabled={loading || !busca.trim()}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {loading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card-bg rounded-lg border border-border overflow-hidden animate-pulse">
              <div className="p-4 border-b border-border">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
              <div className="p-4 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
              <div className="p-4 border-t border-border">
                <div className="h-5 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 mb-4">{error}</div>
      )}

      {active.length > 0 && statusOptions.length > 1 && (
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <button
            className={`px-3 py-1 text-xs font-semibold rounded-full cursor-pointer transition-colors ${
              !filtroStatus ? "bg-accent text-white" : "bg-bg-base text-text-muted hover:text-primary"
            }`}
            onClick={() => setFiltroStatus("")}
          >Todos</button>
          {statusOptions.map((s) => (
            <button
              key={s}
              className={`px-3 py-1 text-xs font-semibold rounded-full cursor-pointer transition-colors ${
                filtroStatus === s ? "bg-accent text-white" : "bg-bg-base text-text-muted hover:text-primary"
              }`}
              onClick={() => setFiltroStatus(s)}
            >
              {STATUS_CONFIG[s]?.label || s}
            </button>
          ))}
        </div>
      )}

      {active.length > 0 && (
        <p className="text-xs text-text-muted mb-3">
          {active.length} {active.length === 1 ? "pedido encontrado" : "pedidos encontrados"}
        </p>
      )}

      {active.some((o) => podePagar(o)) && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800 mb-4 leading-relaxed">
          ⏳ Você tem pedidos aguardando pagamento. O link de pagamento fica disponível por 24 horas após a criação do pedido.
        </div>
      )}

      {active.length === 0 && !loading && !error && orders.length > 0 && (
        <p className="text-sm text-text-muted text-center py-8">Nenhum pedido ativo encontrado.</p>
      )}

      {active.map((order) => {
        const pode = podePagar(order);
        return (
          <div key={order.id} className="bg-card-bg rounded-lg border border-border overflow-hidden mb-4">
            <div className="p-3 sm:p-4 border-b border-border bg-bg-base">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-sm sm:text-lg text-primary break-all">{order.id}</span>
                  <span className="ml-2 text-xs sm:text-sm text-text-muted whitespace-nowrap">{order.data}</span>
                </div>
                <span className={`shrink-0 inline-block px-2 py-1 rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap ${STATUS_CONFIG[order.status]?.bg || "bg-gray-100"} ${STATUS_CONFIG[order.status]?.text || "text-gray-700"}`}>
                  {STATUS_CONFIG[order.status]?.label || order.status}
                </span>
              </div>
            </div>

            {/* Timeline */}
            <div className="px-3 sm:px-4 py-3 space-y-1.5 border-b border-border">
              {["pendente", "pago", "enviado_fornecedor", "em_producao", "a_caminho", "em_estoque", "em_entrega", "entregue"].map((s) => {
                const done = STATUS_PRIORITY[order.status] >= STATUS_PRIORITY[s];
                const current = order.status === s;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${done ? (current ? "bg-accent ring-2 ring-accent/30" : "bg-accent") : "bg-gray-300"}`} />
                    <span className={`text-[10px] sm:text-xs ${done ? "text-text-main font-medium" : "text-text-muted"}`}>
                      {STATUS_CONFIG[s]?.label || s}
                    </span>
                  </div>
                );
              })}
            </div>


            <div className="p-3 sm:p-4 border-b border-border">
              <h4 className="text-xs sm:text-sm font-semibold text-text-muted mb-2">Itens</h4>
              <div className="flex flex-col gap-1.5">
                {order.itens.map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 p-2 sm:p-2.5 bg-bg-base rounded-md">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs sm:text-sm leading-tight">{item.nome}</div>
                      <div className="text-[10px] sm:text-xs text-text-muted mt-0.5">
                        {item.tipo} &middot; {item.tamanho} &middot; {item.genero}
                      </div>
                      {item.personalizado && (
                        <div className="text-[10px] sm:text-xs text-accent mt-0.5 font-medium">
                          ✦ {item.nomePersonalizado} #{item.numeroPersonalizado}
                        </div>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-accent whitespace-nowrap shrink-0">
                      {formatarMoeda(item.preco)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 sm:p-4 flex justify-between items-center">
              <span className="font-bold text-sm sm:text-base">Total</span>
              <span className="font-bold text-base sm:text-lg text-accent">{formatarMoeda(order.total)}</span>
            </div>

            {pode && (
              <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                <a
                  href={`https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${order.mp_preference_id}`}
                  target="_blank" rel="noreferrer"
                  className="block w-full py-3 text-sm font-semibold bg-accent text-white rounded-md text-center no-underline hover:opacity-90 transition-opacity"
                >
                  Pagar Agora
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

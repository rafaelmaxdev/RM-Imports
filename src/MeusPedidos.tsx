import { useState, useMemo, useEffect } from "react";
import { formatarMoeda } from "./types";
import { STATUS_CONFIG } from "./lib/status";
import type { Order } from "./types";
import { getPedidoById } from "./lib/db";
import { saveOrderAccessToken } from "./lib/orderAccess";

const STATUS_PRIORITY: Record<string, number> = {
  pendente: 0, pago: 1, enviado_fornecedor: 2, em_producao: 3,
  a_caminho: 4, em_estoque: 5, em_entrega: 6, entregue: 7,
};
const CURRENT_TIME = Date.now();

export default function MeusPedidos() {
  useEffect(() => {
    document.title = "Acompanhar Pedido — RM Imports";
    document.querySelector('meta[name="description"]')?.setAttribute("content", "Acompanhe o status do seu pedido na RM Imports.");
  }, []);
  const [busca, setBusca] = useState("");
  const [telefone, setTelefone] = useState("");
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
    const phone = telefone.trim();
    if (!q || !phone) return;
    setLoading(true);
    setError("");
    setOrders([]);
    setFiltroStatus("");

    try {
      const up = q.toUpperCase();

      if (up.startsWith("UL-")) {
        const order = await getPedidoById(up, phone);
        if (order) {
          setOrders([order]);
          return;
        }
        setError("Pedido não encontrado. Confira o ID e o telefone informado na compra.");
        return;
      }

      if (!/^\d{6,30}$/.test(q)) {
        setError("Informe um ID do pedido no formato UL-XXXXXXXX ou um ID de pagamento com 6 a 30 dígitos.");
        return;
      }

      const res = await fetch(`/api/order/search?payment=${encodeURIComponent(q)}&phone=${encodeURIComponent(phone)}`);
      if (res.ok) {
        const data = await res.json() as Order;
        if (data.orderAccessToken) saveOrderAccessToken(data.id, data.orderAccessToken);
        setOrders([data]);
        return;
      } else {
        const errBody = await res.json().catch(() => ({}));
        console.log("[MP] API error:", res.status, errBody);
      }

      setError("Nenhum pedido encontrado.");
    } catch (err) {
      console.error("[MP] Erro na busca:", err);
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function podePagar(order: Order): boolean {
    if (order.status !== "pendente" || !order.mp_preference_id) return false;
    if (!order.created_at) return true;
    const horas = (CURRENT_TIME - new Date(order.created_at).getTime()) / 36e5;
    return horas < 24;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Acompanhe sua compra</p>
      <h2 className="mb-3 mt-1 text-3xl font-black tracking-tight text-primary sm:text-4xl">Meu pedido</h2>
      <div className="mb-5 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm leading-relaxed text-text-muted">
        Informe o ID do pedido ou pagamento junto com o telefone usado na compra.
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="ID do pedido ou ID do pagamento"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-card-bg px-4 text-sm shadow-card"
        />
        <input
          type="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="Telefone da compra"
          autoComplete="tel"
          className="min-h-12 min-w-0 rounded-xl border border-border bg-card-bg px-4 text-sm shadow-card"
          aria-label="Telefone usado na compra"
        />
        <button
          className="min-h-12 shrink-0 cursor-pointer rounded-xl bg-accent px-5 text-sm font-bold text-white transition-colors hover:bg-[#d93648] disabled:opacity-50"
          onClick={handleSearch}
          disabled={loading || !busca.trim() || !telefone.trim()}
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
                {order.itens.map((item, i: number) => (
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

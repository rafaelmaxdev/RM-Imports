import { useState } from "react";
import { formatarMoeda } from "./types";
import { STATUS_CONFIG } from "./lib/status";
import type { Order } from "./types";

export default function MeusPedidos() {
  const [busca, setBusca] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch() {
    const q = busca.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setOrders([]);

    const digits = q.replace(/\D/g, "");

    try {
      if (digits.length > 5 && !q.toUpperCase().startsWith("UL-")) {
        const res = await fetch(`/api/public-order?payment=${encodeURIComponent(digits)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setOrders(data as Order[]);
            setLoading(false);
            return;
          }
        }
      }

      if (digits.length >= 8) {
        const res = await fetch(`/api/public-order?phone=${encodeURIComponent(digits)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setOrders(data as Order[]);
            setLoading(false);
            return;
          }
        }
      }

      const up = q.toUpperCase();
      if (up.startsWith("UL-")) {
        const res = await fetch(`/api/public-order/${encodeURIComponent(up)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setOrders(data as Order[]);
            setLoading(false);
            return;
          }
        }
      }

      setError("Nenhum pedido encontrado. Verifique o ID, telefone ou ID do pagamento.");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-16">
      <h2 className="text-xl font-bold text-primary mb-2">Meu Pedido</h2>
      <p className="text-sm text-text-muted mb-2">
        Digite o ID do pedido, seu telefone ou o ID do pagamento para acompanhar.
      </p>
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700 mb-6 leading-relaxed">
        💡 Após o pagamento, você recebe um e-mail do Mercado Pago com o ID da transação. Use esse ID aqui para localizar seu pedido.
      </div>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="ID do pedido ou telefone"
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

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {orders.length > 0 && (
        <p className="text-xs text-text-muted mb-3">
          {orders.length} {orders.length === 1 ? "pedido encontrado" : "pedidos encontrados"}
        </p>
      )}

      {orders.map((order) => (
        <div key={order.id} className="bg-card-bg rounded-lg border border-border overflow-hidden mb-4">
          <div className="p-3 sm:p-4 border-b border-border bg-bg-base">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-bold text-sm sm:text-lg text-primary break-all">{order.id}</span>
                <span className="ml-2 text-xs sm:text-sm text-text-muted whitespace-nowrap">
                  {order.data}
                </span>
              </div>
              <span className={`shrink-0 inline-block px-2 py-1 rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap ${STATUS_CONFIG[order.status]?.bg || "bg-gray-100"} ${STATUS_CONFIG[order.status]?.text || "text-gray-700"}`}>
                {STATUS_CONFIG[order.status]?.label || order.status}
              </span>
            </div>
          </div>

          <div className="p-3 sm:p-4 border-b border-border">
            <h4 className="text-xs sm:text-sm font-semibold text-text-muted mb-2">Itens</h4>
            <div className="flex flex-col gap-1.5">
              {order.itens.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-start gap-2 p-2 sm:p-2.5 bg-bg-base rounded-md">
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

          {order.status === "pendente" && order.mp_preference_id && (
            <div className="px-3 sm:px-4 pb-3 sm:pb-4">
              <a
                href={`https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${order.mp_preference_id}`}
                target="_blank"
                rel="noreferrer"
                className="block w-full py-3 text-sm font-semibold bg-accent text-white rounded-md text-center no-underline hover:opacity-90 transition-opacity"
              >
                Pagar Agora
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

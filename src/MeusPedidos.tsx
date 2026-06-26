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
          setOrders([data as Order]);
          setLoading(false);
          return;
        }
      }

      setError("Nenhum pedido encontrado. Verifique o ID ou telefone.");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-8 pb-16">
      <h2 className="text-xl font-bold text-primary mb-2">Meu Pedido</h2>
      <p className="text-sm text-text-muted mb-6">
        Digite o ID do pedido ou seu telefone para acompanhar.
      </p>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="ID do pedido ou telefone"
          className="flex-1 px-3 py-2.5 text-sm border border-border rounded-md bg-card-bg"
        />
        <button
          className="px-5 py-2.5 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
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

      {orders.map((order) => (
        <div key={order.id} className="bg-card-bg rounded-lg border border-border overflow-hidden mb-4">
          <div className="p-4 border-b border-border bg-bg-base">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-lg text-primary">{order.id}</span>
                <span className="ml-2 text-sm text-text-muted">
                  {order.data} às {order.hora}
                </span>
              </div>
              <span className={`inline-block px-2.5 py-1 rounded text-xs font-semibold ${STATUS_CONFIG[order.status]?.bg || "bg-gray-100"} ${STATUS_CONFIG[order.status]?.text || "text-gray-700"}`}>
                {STATUS_CONFIG[order.status]?.label || order.status}
              </span>
            </div>
          </div>

          <div className="p-4 border-b border-border">
            <h4 className="text-sm font-semibold text-text-muted mb-3">Itens</h4>
            <div className="flex flex-col gap-2">
              {order.itens.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-start p-2.5 bg-bg-base rounded-md">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{item.nome}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {item.tipo} • Tam: {item.tamanho} • {item.genero}
                    </div>
                    {item.personalizado && (
                      <div className="text-xs text-accent mt-0.5">
                        {item.nomePersonalizado} #{item.numeroPersonalizado}
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-accent whitespace-nowrap ml-3">
                    {formatarMoeda(item.preco)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 flex justify-between items-center">
            <span className="font-bold text-base">Total</span>
            <span className="font-bold text-lg text-accent">{formatarMoeda(order.total)}</span>
          </div>

          {order.status === "pendente" && order.mp_preference_id && (
            <div className="px-4 pb-4">
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

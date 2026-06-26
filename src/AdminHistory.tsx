import { useState, useEffect, useCallback } from "react";
import { getPedidos, deletePedido, updatePedidoAdminOrder } from "./lib/db";
import type { Order } from "./types";
import { formatarMoeda } from "./types";
import { STATUS_CONFIG_ADMIN, PAYMENT_LABELS_SHORT } from "./lib/status";
import { buscaPorPalavras } from "./lib/utils";

export default function AdminHistory() {
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "entregue" | "cancelado" | "reembolsado">("all");
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const all = await getPedidos();
      setHistory(all.filter((o) => ["entregue", "cancelado", "reembolsado"].includes(o.status)));
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleDelete(id: string) {
    if (!confirm(`Remover pedido ${id} do histórico?`)) return;
    await deletePedido(id);
    setHistory((prev) => prev.filter((o) => o.id !== id));
  }

  const filteredHistory = history.filter((order) => {
    if (filter === "entregue" && order.status !== "entregue") return false;
    if (filter === "cancelado" && order.status !== "cancelado") return false;
    if (filter === "reembolsado" && order.status !== "reembolsado") return false;
    if (!search.trim()) return true;
    const campos = [
      order.id,
      order.endereco?.nome,
      order.endereco?.telefone,
      order.mp_payment_id,
      ...order.itens.map((item) => item.nome),
    ].filter(Boolean).join(" ");
    return buscaPorPalavras(search, campos);
  });

  if (loading) {
    return <div className="text-center py-16 text-text-muted text-lg">Carregando histórico...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h2 className="text-xl text-primary m-0">Histórico ({filteredHistory.length})</h2>
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <button
            className={`px-3 py-2 text-sm font-semibold rounded-md cursor-pointer transition-all whitespace-nowrap ${
              refreshing
                ? "bg-accent/20 text-accent/60"
                : "bg-accent/10 text-accent hover:bg-accent/20"
            }`}
            onClick={() => loadHistory(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block animate-spin">↻</span> Atualizando…
              </span>
            ) : (
              "↻ Atualizar"
            )}
          </button>
          <select
            className="px-3 py-2 border border-border rounded-md text-sm bg-card-bg"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">Todos</option>
            <option value="entregue">Entregues</option>
            <option value="cancelado">Cancelados</option>
            <option value="reembolsado">Reembolsados</option>
          </select>
          <input
            type="text"
            placeholder="Buscar ID, nome, tel..."
            className="px-3 py-2 border border-border rounded-md text-sm flex-1 sm:w-52 min-w-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <p className="text-center text-text-muted py-8">Nenhum pedido no histórico.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredHistory.map((order) => {
            const isExpanded = expandedId === order.id;
            const totalItens = order.itens.length;
            const totalPersonalizacoes = order.itens.filter((i) => i.personalizado).length;
            const statusInfo = STATUS_CONFIG_ADMIN[order.status] || STATUS_CONFIG_ADMIN.entregue;
            const paymentLabel = order.payment_method ? PAYMENT_LABELS_SHORT[order.payment_method] || order.payment_method : null;

            return (
              <div key={order.id} className={`bg-card-bg rounded-md shadow-card overflow-hidden ${["cancelado", "reembolsado"].includes(order.status) ? "opacity-70" : ""}`}>
                {/* Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-bg-base transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-lg text-primary">{order.id}</span>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusInfo.bg} ${statusInfo.text}`}>
                          {statusInfo.label}
                        </span>
                        {paymentLabel && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                            {paymentLabel}
                          </span>
                        )}
                        {order.admin_order && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
                            👤 Admin
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-text-muted mt-1">
                        {order.data} às {order.hora} • {totalItens} {totalItens === 1 ? "item" : "itens"}
                        {totalPersonalizacoes > 0 && ` • ${totalPersonalizacoes} personalização${totalPersonalizacoes > 1 ? "ões" : ""}`}
                      </div>
                      {order.endereco && (
                        <div className="text-sm text-text-muted mt-0.5">
                          {order.endereco.nome} • {order.endereco.cidade}/{order.endereco.estado}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-bold text-lg text-accent">{formatarMoeda(order.total)}</div>
                      <button
                        className="bg-none border-none text-text-muted cursor-pointer text-sm leading-none hover:text-accent transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}
                        title="Remover do histórico"
                      >
                        ✕
                      </button>
                      <span className={`text-text-muted text-sm transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border">
                    {/* Items */}
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-text-muted mb-2">Itens do Pedido</h4>
                      <div className="flex flex-col gap-2">
                        {order.itens.map((item, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-bg-base rounded-md">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm">{item.nome}</div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted mt-1">
                                <span className="px-1.5 py-0.5 bg-primary/10 rounded">{item.tipo}</span>
                                <span>Tam: {item.tamanho}</span>
                                <span>Modelo: {item.genero}</span>
                                {item.temporada && <span>Temp: {item.temporada}</span>}
                              </div>
                              {item.personalizado && (
                                <div className="text-xs text-accent font-semibold mt-1">
                                  ✦ Personalizado: {item.nomePersonalizado} #{item.numeroPersonalizado}
                                </div>
                              )}
                            </div>
                            <div className="font-bold text-sm text-accent whitespace-nowrap">
                              {item.precoBase != null && item.precoBase > item.preco ? (
                                <span className="flex items-baseline gap-1">
                                  <span className="text-text-muted text-xs line-through">{formatarMoeda(item.precoBase)}</span>
                                  <span>{formatarMoeda(item.preco)}</span>
                                </span>
                              ) : (
                                <span>{formatarMoeda(item.preco)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Transaction ID */}
                    {order.mp_payment_id && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-text-muted mb-2">ID da Transação</h4>
                        <div className="p-3 bg-bg-base rounded-md text-sm font-mono">{order.mp_payment_id}</div>
                      </div>
                    )}

                    {/* Address */}
                    {order.endereco && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-text-muted mb-2">Endereço de Entrega</h4>
                        <div className="p-3 bg-bg-base rounded-md text-sm">
                          <div className="font-semibold">{order.endereco.nome}</div>
                          <div>{order.endereco.rua}, {order.endereco.numero}{order.endereco.complemento ? ` - ${order.endereco.complemento}` : ""}</div>
                          <div>{order.endereco.bairro} - {order.endereco.cidade}/{order.endereco.estado}</div>
                          <div>CEP: {order.endereco.cep} • Tel: {order.endereco.telefone}</div>
                        </div>
                      </div>
                    )}

                    {/* Total */}
                    <div className="flex justify-between items-center pt-4 mt-4 border-t border-border">
                      <div className="font-bold text-lg">Total: {formatarMoeda(order.total)}</div>
                    </div>

                    {/* Admin Order Toggle */}
                    <div className="flex items-center gap-2 pt-3 mt-3 border-t border-border">
                      <button
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md border-none cursor-pointer transition-opacity hover:opacity-85 ${
                          order.admin_order ? "bg-purple-500 text-white" : "bg-gray-200 text-gray-600"
                        }`}
                        onClick={() => {
                          const newVal = !order.admin_order;
                          if (confirm(newVal ? "Marcar como pedido do admin (não conta como lucro)?" : "Desmarcar pedido do admin?")) {
                            updatePedidoAdminOrder(order.id, newVal);
                            setHistory((prev) => prev.map((o) => o.id === order.id ? { ...o, admin_order: newVal } : o));
                          }
                        }}
                      >
                        {order.admin_order ? "👤 Pedido do Admin" : "👤 Marcar como Admin"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
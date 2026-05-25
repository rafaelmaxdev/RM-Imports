import { useState, useEffect, useCallback } from "react";
import { getPedidos, deletePedido, updatePedidoAdminOrder } from "./lib/db";
import type { Order } from "./types";
import { formatarMoeda } from "./types";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pendente: { label: "Pendente", bg: "bg-yellow-100", text: "text-yellow-800" },
  pago: { label: "Pago", bg: "bg-green-100", text: "text-green-800" },
  enviado_fornecedor: { label: "Enviado ao fornecedor", bg: "bg-blue-100", text: "text-blue-800" },
  em_producao: { label: "Em produção", bg: "bg-purple-100", text: "text-purple-800" },
  a_caminho: { label: "A caminho", bg: "bg-indigo-100", text: "text-indigo-800" },
  em_estoque: { label: "Em estoque", bg: "bg-teal-100", text: "text-teal-800" },
  em_entrega: { label: "Em entrega", bg: "bg-cyan-100", text: "text-cyan-800" },
  entregue: { label: "Entregue", bg: "bg-emerald-100", text: "text-emerald-800" },
  cancelado: { label: "Cancelado", bg: "bg-red-100", text: "text-red-800" },
  reembolsado: { label: "Reembolsado", bg: "bg-gray-100", text: "text-gray-800" },
};

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão",
  debit_card: "Débito",
};

export default function AdminHistory() {
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "entregue" | "cancelado" | "reembolsado">("all");

  const loadHistory = useCallback(async () => {
    try {
      const all = await getPedidos();
      setHistory(all.filter((o) => ["entregue", "cancelado", "reembolsado"].includes(o.status)));
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    } finally {
      setLoading(false);
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
    const term = search.toLowerCase();
    if (!term) return true;
    if (order.id.toLowerCase().includes(term)) return true;
    if (order.endereco?.nome?.toLowerCase().includes(term)) return true;
    if (order.endereco?.telefone?.includes(term)) return true;
    if (order.itens.some((item) => item.nome.toLowerCase().includes(term))) return true;
    if (order.mp_payment_id?.toLowerCase().includes(term)) return true;
    return false;
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
            className="px-3 py-2 text-sm font-semibold bg-accent/10 text-accent rounded-md cursor-pointer hover:bg-accent/20 transition-colors whitespace-nowrap"
            onClick={loadHistory}
          >
            ↻ Atualizar
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
            const statusInfo = STATUS_CONFIG[order.status] || STATUS_CONFIG.entregue;
            const paymentLabel = order.payment_method ? PAYMENT_LABELS[order.payment_method] || order.payment_method : null;

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
                              {formatarMoeda(item.preco)}
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
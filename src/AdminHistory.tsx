import { useState, useEffect, useCallback } from "react";
import { getPedidos, deletePedido } from "./lib/db";
import type { Order } from "./types";
import { formatarMoeda } from "./types";

export default function AdminHistory() {
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      const all = await getPedidos();
      setHistory(all.filter((o) => o.status === "entregue"));
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
    const term = search.toLowerCase();
    if (!term) return true;
    if (order.id.toLowerCase().includes(term)) return true;
    if (order.endereco?.nome?.toLowerCase().includes(term)) return true;
    if (order.endereco?.telefone?.includes(term)) return true;
    if (order.itens.some((item) => item.nome.toLowerCase().includes(term))) return true;
    return false;
  });

  if (loading) {
    return <div className="text-center py-16 text-text-muted text-lg">Carregando histórico...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl text-primary m-0">Histórico ({filteredHistory.length})</h2>
        <div className="flex gap-2 items-center">
          <button
            className="px-3 py-2 text-sm font-semibold bg-accent/10 text-accent rounded-md cursor-pointer hover:bg-accent/20 transition-colors"
            onClick={loadHistory}
          >
            ↻ Atualizar
          </button>
          <input
            type="text"
            placeholder="Buscar por ID, nome, telefone ou produto..."
            className="px-3 py-2 border border-border rounded-md text-sm w-80"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <p className="text-center text-text-muted py-8">Nenhum pedido entregue ainda.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredHistory.map((order) => {
            const isExpanded = expandedId === order.id;
            const totalItens = order.itens.length;
            const totalPersonalizacoes = order.itens.filter((i) => i.personalizado).length;

            return (
              <div key={order.id} className="bg-card-bg rounded-md shadow-card overflow-hidden opacity-90">
                {/* Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-bg-base transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-lg text-primary">{order.id}</span>
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-cyan-100 text-cyan-800">
                          Entregue
                        </span>
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
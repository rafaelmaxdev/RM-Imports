import { useState, useEffect, useCallback, useMemo } from "react";
import { getPedidos, updatePedidoStatus, deletePedido, updatePedidoAdminOrder, updatePedidoProntaEntrega, addOrderItemsToEstoque, autoCancelExpiredOrders } from "./lib/db";
import { clearCache } from "./lib/cache";
import type { Order } from "./types";
import { formatarMoeda } from "./types";
import { supabase } from "./lib/supabase";
import { STATUS_CONFIG_ADMIN, STATUS_FLOW, PAYMENT_LABELS_SHORT } from "./lib/status";
import { buscaPorPalavras } from "./lib/utils";

function montarMensagemCliente(order: Order): string {
  const isRetirada = order.endereco?.deliveryMethod === "retirada";

  let msg = `*RM Imports*\n`;
  msg += `Pedido: ${order.id}\n`;
  msg += `Status: ${STATUS_CONFIG_ADMIN[order.status]?.label || order.status}\n\n`;

  msg += `*Itens:*\n`;
  order.itens.forEach((item, i) => {
    msg += `${i + 1}. ${item.nome} (${item.tamanho})\n`;
  });
  msg += `\n*Total: ${formatarMoeda(order.total)}*\n`;

  if (order.endereco) {
    msg += `\n*${isRetirada ? "Retirada" : "Entrega"}:*\n`;
    msg += `${order.endereco.nome}\n`;
    if (!isRetirada) {
      msg += `${order.endereco.rua}, ${order.endereco.numero}`;
      if (order.endereco.complemento) msg += ` - ${order.endereco.complemento}`;
      msg += `\n${order.endereco.bairro} - ${order.endereco.cidade}/${order.endereco.estado}\n`;
    }
    msg += `Tel: ${order.endereco.telefone}\n`;
  }

  msg += `\nAcompanhe aqui:\nhttps://rm-imports.vercel.app/pedido/${order.id}`;
  return msg;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [peFilter, setPeFilter] = useState(false);

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // Auto-cancel pending orders older than 24h (PIX expiration)
      const cancelled = await autoCancelExpiredOrders(24);
      if (cancelled > 0) {
        console.log(`Auto-cancelados ${cancelled} pedido(s) expirado(s)`);
      }
      const all = await getPedidos();
      setOrders(all.filter((o) => !["entregue", "cancelado", "reembolsado"].includes(o.status)));
    } catch (err) {
      console.error("Erro ao carregar pedidos:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (statusFilter !== "all" && order.status !== statusFilter) return false;
    if (peFilter && !order.pronta_entrega) return false;
    if (!search.trim()) return true;
    const campos = [
      order.id,
      order.endereco?.nome,
      order.endereco?.telefone,
      order.mp_payment_id,
      ...order.itens.map((item) => item.nome),
    ].filter(Boolean).join(" ");
    return buscaPorPalavras(search, campos);
  }), [orders, statusFilter, peFilter, search]);

  async function handleStatusChange(id: string, newStatus: string) {
    const label = STATUS_CONFIG_ADMIN[newStatus]?.label || newStatus;

    // If refunding, call the refund API first
    if (newStatus === "reembolsado") {
      const order = orders.find((o) => o.id === id);
      if (!order) return;

      if (order.mp_payment_id) {
        if (!confirm(`Reembolsar pedido ${id} no Mercado Pago e alterar status para "${label}"?`)) return;

        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          const res = await fetch("/api/refund", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ orderId: id }),
          });

          const data = await res.json();

          if (!res.ok) {
            alert(`Erro ao reembolsar: ${data.error || data.details || "Erro desconhecido"}`);
            return;
          }

          alert(`Reembolso processado com sucesso!${data.refundId ? ` ID: ${data.refundId}` : ""}`);
        } catch (err) {
          alert("Erro de conexão ao processar reembolso. Tente novamente.");
          console.error("Refund error:", err);
          return;
        }
      } else {
        // No MP payment ID — just update status (manual payment)
        if (!confirm(`Alterar status para "${label}"? (Pedido sem pagamento no Mercado Pago)`)) return;
        try {
          await updatePedidoStatus(id, newStatus);
        } catch (err: any) {
          alert(err.message || "Erro ao atualizar status do pedido.");
          return;
        }
      }
    } else {
      if (!confirm(`Alterar status para "${label}"?`)) return;
      try {
        await updatePedidoStatus(id, newStatus);
      } catch (err: any) {
        alert(err.message || "Erro ao atualizar status do pedido.");
        return;
      }
    }

    const currentOrder = orders.find((o) => o.id === id);

    if (["cancelado", "reembolsado"].includes(newStatus) && currentOrder?.pronta_entrega) {
      // Restore stock on cancel/refund (stock was deducted at order creation)
      try {
        await addOrderItemsToEstoque(currentOrder);
      } catch (err) {
        console.error("Erro ao restaurar estoque:", err);
      }
    }

    clearCache("pedidos");

    if (["entregue", "cancelado", "reembolsado"].includes(newStatus)) {
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } else {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus as Order["status"] } : o)));
    }
  }

  async function handleDelete(id: string) {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    if (order.status !== "cancelado") {
      alert("Apenas pedidos cancelados podem ser excluídos. Cancele o pedido primeiro.");
      return;
    }
    if (!confirm(`Excluir pedido ${id}? Esta ação não pode ser desfeita.`)) return;
    try {
      await deletePedido(id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (err: any) {
      alert(err.message || "Erro ao excluir pedido.");
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-text-muted text-lg">Carregando pedidos...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h2 className="text-xl text-primary m-0">Pedidos ({filteredOrders.length})</h2>
        <div className="flex gap-2 items-center w-full sm:w-auto flex-wrap">
          <button
            className={`px-3 py-2 text-sm font-semibold rounded-md cursor-pointer transition-all whitespace-nowrap ${
              refreshing
                ? "bg-accent/20 text-accent/60"
                : "bg-accent/10 text-accent hover:bg-accent/20"
            }`}
            onClick={() => loadOrders(true)}
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="enviado_fornecedor">Enviado fornecedor</option>
            <option value="em_producao">Em produção</option>
            <option value="a_caminho">A caminho</option>
            <option value="em_estoque">Em estoque</option>
            <option value="em_entrega">Em entrega</option>
          </select>
          <button
            className={`px-3 py-2 text-sm font-semibold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
              peFilter
                ? "bg-teal-500 text-white"
                : "bg-gray-100 text-text-muted hover:bg-gray-200"
            }`}
            onClick={() => setPeFilter((prev) => !prev)}
          >
            📦 PE
          </button>
          <input
            type="text"
            placeholder="Buscar ID, nome, tel..."
            className="px-3 py-2 border border-border rounded-md text-sm flex-1 sm:w-52 min-w-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <p className="text-center text-text-muted py-8">Nenhum pedido encontrado.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const totalItens = order.itens.length;
            const totalPersonalizacoes = order.itens.filter((i) => i.personalizado).length;
            const totalPE = order.itens.filter((i) => i.prontaEntrega).length;
            const statusInfo = STATUS_CONFIG_ADMIN[order.status] || STATUS_CONFIG_ADMIN.pendente;
            const paymentLabel = order.payment_method ? PAYMENT_LABELS_SHORT[order.payment_method] || order.payment_method : null;

            return (
              <div key={order.id} className="bg-card-bg rounded-md shadow-card overflow-hidden">
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
                        {order.pronta_entrega && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-800">
                            📦 Estoque
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-text-muted mt-1">
                        {order.data} às {order.hora} • {totalItens} {totalItens === 1 ? "item" : "itens"}
                        {totalPersonalizacoes > 0 && ` • ${totalPersonalizacoes} personalização${totalPersonalizacoes > 1 ? "ões" : ""}`}
                        {totalPE > 0 && ` • ${totalPE} pronta entrega`}
                      </div>
                      {order.status === "pago" && (
                        <div className="text-xs text-accent font-semibold mt-1">
                          📦 Vá em "Pacotes" para montar e enviar ao fornecedor
                        </div>
                      )}
                      {order.endereco && (
                        <div className="text-sm text-text-muted mt-0.5">
                          {order.endereco.nome} • {order.endereco.cidade}/{order.endereco.estado}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-bold text-lg text-accent">{formatarMoeda(order.total)}</div>
                      {order.status === "cancelado" && (
                        <button
                          className="bg-none border-none text-text-muted cursor-pointer text-lg leading-none hover:text-red-500 transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}
                          title="Excluir pedido (apenas cancelados)"
                        >
                          ✕
                        </button>
                      )}
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
                              <div className="font-semibold text-sm">
                                {item.nome}
                                {item.prontaEntrega && (
                                  <span className="ml-1.5 text-[9px] font-extrabold px-1 py-0.5 bg-teal-500 text-white rounded-sm uppercase tracking-wider align-middle">
                                    PE {item.peMarkup ? `+R$${item.peMarkup}` : ''}
                                  </span>
                                )}
                              </div>
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

                    {/* Status Actions */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 mt-4 border-t border-border gap-3">
                      <div className="font-bold text-lg">Total: {formatarMoeda(order.total)}</div>
                      <div className="flex gap-2 flex-wrap">
                        {STATUS_FLOW[order.status]?.map((nextStatus) => {
                          const next = STATUS_CONFIG_ADMIN[nextStatus];
                          const btnColors: Record<string, string> = {
                            pago: "bg-green-500",
                            enviado_fornecedor: "bg-blue-500",
                            em_producao: "bg-purple-500",
                            a_caminho: "bg-indigo-500",
                            em_estoque: "bg-teal-500",
                            em_entrega: "bg-cyan-500",
                            entregue: "bg-emerald-500",
                            cancelado: "bg-red-400",
                            reembolsado: "bg-gray-500",
                          };
                          return (
                            <button
                              key={nextStatus}
                              className={`inline-flex items-center justify-center px-4 py-2.5 rounded-md border-none text-sm font-semibold cursor-pointer transition-opacity hover:opacity-85 text-white ${btnColors[nextStatus] || "bg-gray-500"} min-h-9 whitespace-nowrap`}
                              onClick={() => handleStatusChange(order.id, nextStatus)}
                            >
                              ✓ {next.label}
                            </button>
                          );
                        })}
                        {order.endereco?.telefone && (
                          <a
                            href={`https://wa.me/${order.endereco.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(montarMensagemCliente(order))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center px-4 py-2.5 rounded-md border-none text-sm font-semibold cursor-pointer transition-opacity hover:opacity-85 text-white bg-green-600 min-h-9 whitespace-nowrap no-underline"
                          >
                            📱 Notificar Cliente
                          </a>
                        )}
                      </div>
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
                            setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, admin_order: newVal } : o));
                          }
                        }}
                      >
                        {order.admin_order ? "👤 Pedido do Admin" : "👤 Marcar como Admin"}
                      </button>
                      <button
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md border-none cursor-pointer transition-opacity hover:opacity-85 ${
                          order.pronta_entrega ? "bg-teal-500 text-white" : "bg-gray-200 text-gray-600"
                        }`}
                        onClick={() => {
                          const newVal = !order.pronta_entrega;
                          if (confirm(newVal ? "Marcar como Pronta Entrega? (Itens irão para o estoque ao ser entregue)" : "Desmarcar Pronta Entrega?")) {
                            updatePedidoProntaEntrega(order.id, newVal);
                            setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, pronta_entrega: newVal } : o));
                          }
                        }}
                      >
                        {order.pronta_entrega ? "📦 Pronta Entrega" : "📦 Marcar p/ Estoque"}
                      </button>
                    </div>

                    {/* Cancel button — available for any non-final status */}
                    {!["entregue", "cancelado", "reembolsado"].includes(order.status) && (
                      <div className="pt-3 mt-3 border-t border-border">
                        <button
                          className="w-full py-2.5 text-sm font-semibold bg-red-500 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => handleStatusChange(order.id, "cancelado")}
                        >
                          ✕ Cancelar Pedido
                        </button>
                      </div>
                    )}
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
import { useState, useEffect, useCallback } from "react";
import { getPedidos, updatePedidoStatus, deletePedido, updatePedidoAdminOrder } from "./lib/db";
import type { Order } from "./types";
import { formatarMoeda } from "./types";
import { supabase } from "./lib/supabase";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pendente: { label: "Pendente", bg: "bg-yellow-100", text: "text-yellow-800" },
  em_analise: { label: "Em análise", bg: "bg-orange-100", text: "text-orange-800" },
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

const STATUS_FLOW: Record<string, string[]> = {
  pendente: ["pago", "em_analise", "cancelado"],
  em_analise: ["pago", "cancelado"],
  pago: ["enviado_fornecedor", "reembolsado", "cancelado"],
  enviado_fornecedor: ["em_producao"],
  em_producao: ["a_caminho"],
  a_caminho: ["em_estoque"],
  em_estoque: ["em_entrega"],
  em_entrega: ["entregue"],
};

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão",
  debit_card: "Débito",
};

function montarMensagemCliente(order: Order): string {
  let msg = `*RM Imports - Pedido ${order.id}*\n`;
  msg += `✅ Pagamento confirmado!\n\n`;
  msg += `*Resumo:*\n`;
  order.itens.forEach((item, i) => {
    msg += `${i + 1}. ${item.nome} - ${item.tamanho} - ${formatarMoeda(item.preco)}\n`;
  });
  msg += `\n*Total: ${formatarMoeda(order.total)}*\n`;
  if (order.endereco) {
    msg += `\n*Entrega:*\n${order.endereco.rua}, ${order.endereco.numero}`;
    if (order.endereco.complemento) msg += ` - ${order.endereco.complemento}`;
    msg += `\n${order.endereco.bairro} - ${order.endereco.cidade}/${order.endereco.estado}`;
  }
  msg += `\n\nAcompanhe seu pedido em:\nhttps://rm-imports.vercel.app/pedido/${order.id}`;
  return msg;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadOrders = useCallback(async () => {
    try {
      const all = await getPedidos();
      setOrders(all.filter((o) => !["entregue", "cancelado", "reembolsado"].includes(o.status)));
    } catch (err) {
      console.error("Erro ao carregar pedidos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = orders.filter((order) => {
    if (statusFilter !== "all" && order.status !== statusFilter) return false;
    const term = search.toLowerCase();
    if (!term) return true;
    if (order.id.toLowerCase().includes(term)) return true;
    if (order.endereco?.nome?.toLowerCase().includes(term)) return true;
    if (order.endereco?.telefone?.includes(term)) return true;
    if (order.itens.some((item) => item.nome.toLowerCase().includes(term))) return true;
    if (order.mp_payment_id?.toLowerCase().includes(term)) return true;
    return false;
  });

  async function handleStatusChange(id: string, newStatus: string) {
    const label = STATUS_CONFIG[newStatus]?.label || newStatus;

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
        await updatePedidoStatus(id, newStatus);
      }
    } else {
      if (!confirm(`Alterar status para "${label}"?`)) return;
      await updatePedidoStatus(id, newStatus);
    }

    if (["entregue", "cancelado", "reembolsado"].includes(newStatus)) {
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } else {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus as Order["status"] } : o)));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Excluir pedido ${id}? Esta ação não pode ser desfeita.`)) return;
    await deletePedido(id);
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }

  if (loading) {
    return <div className="text-center py-16 text-text-muted text-lg">Carregando pedidos...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h2 className="text-xl text-primary m-0">Pedidos ({filteredOrders.length})</h2>
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <button
            className="px-3 py-2 text-sm font-semibold bg-accent/10 text-accent rounded-md cursor-pointer hover:bg-accent/20 transition-colors whitespace-nowrap"
            onClick={loadOrders}
          >
            ↻ Atualizar
          </button>
          <select
            className="px-3 py-2 border border-border rounded-md text-sm bg-card-bg"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="em_analise">Em análise</option>
            <option value="pago">Pago</option>
            <option value="enviado_fornecedor">Enviado fornecedor</option>
            <option value="em_producao">Em produção</option>
            <option value="a_caminho">A caminho</option>
            <option value="em_estoque">Em estoque</option>
            <option value="em_entrega">Em entrega</option>
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

      {filteredOrders.length === 0 ? (
        <p className="text-center text-text-muted py-8">Nenhum pedido encontrado.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const totalItens = order.itens.length;
            const totalPersonalizacoes = order.itens.filter((i) => i.personalizado).length;
            const statusInfo = STATUS_CONFIG[order.status] || STATUS_CONFIG.pendente;
            const paymentLabel = order.payment_method ? PAYMENT_LABELS[order.payment_method] || order.payment_method : null;

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
                        className="bg-none border-none text-text-muted cursor-pointer text-lg leading-none hover:text-accent transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}
                        title="Excluir pedido"
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
                          const next = STATUS_CONFIG[nextStatus];
                          const btnColors: Record<string, string> = {
                            pago: "bg-green-500",
                            em_analise: "bg-orange-500",
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
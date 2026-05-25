import { useState, useEffect, useCallback } from "react";
import { getPedidos, updatePedidoStatus } from "./lib/db";
import type { Order } from "./types";
import { montarMensagemPacote, WHATSAPP_NUMBER, formatarMoeda, TAMANHO_FORNECEDOR } from "./types";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão",
  debit_card: "Débito",
};

const TIPO_ENGLISH: Record<string, string> = {
  "Torcedor": "Fan",
  "Jogador": "Player",
  "Retrô": "Retro",
  "Manga Longa": "Long Sleeve",
  "Goleiro": "Goalkeeper",
  "Treinamento": "Training",
  "Polo": "Polo",
  "NBA": "NBA",
};

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  enviado_fornecedor: { label: "Enviado ao fornecedor", bg: "bg-blue-100", text: "text-blue-800" },
  em_producao: { label: "Em produção", bg: "bg-purple-100", text: "text-purple-800" },
  a_caminho: { label: "A caminho", bg: "bg-indigo-100", text: "text-indigo-800" },
  em_estoque: { label: "Em estoque", bg: "bg-teal-100", text: "text-teal-800" },
  em_entrega: { label: "Em entrega", bg: "bg-cyan-100", text: "text-cyan-800" },
};

const NEXT_STATUS: Record<string, string> = {
  enviado_fornecedor: "em_producao",
  em_producao: "a_caminho",
  a_caminho: "em_estoque",
  em_estoque: "em_entrega",
  em_entrega: "entregue",
};

const STATUS_ACTION_LABELS: Record<string, string> = {
  enviado_fornecedor: "Marcar como Em Produção",
  em_producao: "Marcar como A Caminho",
  a_caminho: "Marcar como Em Estoque",
  em_estoque: "Marcar como Em Entrega",
  em_entrega: "Marcar como Entregue",
};

type Step = "select" | "review";

interface SentPackage {
  orders: Order[];
  custoPacote: string;
  frete: string;
  taxaImportacao: string;
}

export default function AdminPacotes() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [sentOrders, setSentOrders] = useState<Order[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [custoPacote, setCustoPacote] = useState("");
  const [frete, setFrete] = useState("");
  const [taxaImportacao, setTaxaImportacao] = useState("");
  const [sentPackages, setSentPackages] = useState<SentPackage[]>([]);
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const all = await getPedidos();
      setOrders(all.filter((o) => o.status === "pago"));
      setSentOrders(all.filter((o) => ["enviado_fornecedor", "em_producao", "a_caminho", "em_estoque", "em_entrega"].includes(o.status)));
    } catch (err) {
      console.error("Erro ao carregar pedidos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
  const totalShirts = selectedOrders.reduce((sum, o) => sum + o.itens.length, 0);

  const wouldExceed = (order: Order): boolean => {
    if (selectedIds.has(order.id)) return false;
    if (selectedIds.size === 0) return false;
    return totalShirts + order.itens.length > 8;
  };

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSend() {
    if (selectedOrders.length === 0) return;

    setSending(true);
    try {
      const msg = montarMensagemPacote(selectedOrders);
      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank");

      await Promise.all(selectedOrders.map((o) => updatePedidoStatus(o.id, "enviado_fornecedor")));

      // Save package for financial tracking
      setSentPackages((prev) => [...prev, {
        orders: [...selectedOrders],
        custoPacote,
        frete,
        taxaImportacao,
      }]);

      setOrders((prev) => prev.filter((o) => !selectedIds.has(o.id)));
      setSelectedIds(new Set());
      setStep("select");
      setCustoPacote("");
      setFrete("");
      setTaxaImportacao("");

      // Reload to get updated sent orders
      loadOrders();
    } catch (err) {
      console.error("Erro ao enviar pacote:", err);
      alert("Erro ao atualizar status dos pedidos. Verifique manualmente.");
    } finally {
      setSending(false);
    }
  }

  async function handleAdvanceStatus(orderId: string, currentStatus: string) {
    const nextStatus = NEXT_STATUS[currentStatus];
    if (!nextStatus) return;

    const label = STATUS_ACTION_LABELS[currentStatus] || `Avançar para ${nextStatus}`;
    if (!confirm(`${label} para o pedido ${orderId}?`)) return;

    try {
      await updatePedidoStatus(orderId, nextStatus);
      setSentOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: nextStatus as Order["status"] } : o));
      if (nextStatus === "entregue") {
        // Remove from sent orders — will show in Histórico
        setSentOrders((prev) => prev.filter((o) => o.id !== orderId));
      }
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      alert("Erro ao atualizar status. Verifique manualmente.");
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-text-muted text-lg">Carregando pedidos...</div>;
  }

  // ── Review step ──
  if (step === "review") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            className="px-3 py-2 text-sm font-semibold bg-border text-text-main rounded-md cursor-pointer hover:bg-gray-300 transition-colors"
            onClick={() => setStep("select")}
          >
            ← Voltar
          </button>
          <div>
            <h2 className="text-xl text-primary m-0">Revisar Pacote</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {selectedOrders.length} pedido(s) • {totalShirts}/8 camisas
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {selectedOrders.map((order) => (
            <div key={order.id} className="bg-card-bg rounded-md shadow-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-lg text-primary">{order.id}</span>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                    Pago
                  </span>
                  {order.payment_method && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                      {PAYMENT_LABELS[order.payment_method] || order.payment_method}
                    </span>
                  )}
                  {order.admin_order && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
                      👤 Admin
                    </span>
                  )}
                </div>
                {order.endereco && (
                  <div className="text-sm text-text-muted mt-1">
                    {order.endereco.nome} • {order.endereco.cidade}/{order.endereco.estado}
                  </div>
                )}
                <div className="text-sm text-text-muted mt-0.5">
                  {order.data} às {order.hora} • {order.itens.length} camisa{order.itens.length !== 1 ? "s" : ""} • {formatarMoeda(order.total)}
                </div>
              </div>

              <div className="p-4">
                <div className="flex flex-col gap-3">
                  {order.itens.map((item, i) => {
                    const tipoEn = TIPO_ENGLISH[item.tipo] || item.tipo;
                    const version = item.feminino && item.genero === "Feminino"
                      ? `${tipoEn} WOMANS`
                      : `${tipoEn} MALE`;

                    return (
                      <div key={i} className="p-3 bg-bg-base rounded-md">
                        <div className="font-semibold text-sm">{item.nome}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted mt-1">
                          <span>Size: {TAMANHO_FORNECEDOR[item.tamanho] || item.tamanho}</span>
                          <span>Version: {version}</span>
                        </div>
                        {item.personalizado && (
                          <div className="text-xs text-accent font-semibold mt-1">
                            Name: {item.nomePersonalizado} / Number: {item.numeroPersonalizado}
                          </div>
                        )}
                        <div className="text-xs text-text-muted mt-1 truncate">
                          {item.yupooUrl || "N/A"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-card-bg border-t border-border p-4 mt-6 flex items-center justify-between shadow-lg">
          <div>
            <span className="font-bold">{selectedOrders.length} pedido(s)</span>
            <span className="text-text-muted ml-3">{totalShirts}/8 camisas</span>
          </div>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-6 py-3 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? "Enviando..." : "✓ Confirmar e Enviar ao Fornecedor"}
          </button>
        </div>
      </div>
    );
  }

  // ── Select step ──
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Sent packages — financial tracking */}
      {sentOrders.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg text-primary mb-3">📦 Pacotes Enviados</h3>
          <div className="flex flex-col gap-3">
            {sentOrders.map((order) => {
              const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.enviado_fornecedor;
              const nextAction = STATUS_ACTION_LABELS[order.status];
              const isExpanded = expandedPkg === order.id;

              return (
                <div key={order.id} className="bg-card-bg rounded-md shadow-card overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-bg-base transition-colors"
                    onClick={() => setExpandedPkg(isExpanded ? null : order.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-primary">{order.id}</span>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusInfo.bg} ${statusInfo.text}`}>
                            {statusInfo.label}
                          </span>
                          {order.payment_method && (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                              {PAYMENT_LABELS[order.payment_method] || order.payment_method}
                            </span>
                          )}
                          {order.admin_order && (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
                              👤 Admin
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-text-muted mt-1">
                          {order.endereco?.nome} • {order.itens.length} camisa{order.itens.length !== 1 ? "s" : ""} • {formatarMoeda(order.total)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {nextAction && (
                          <button
                            className="px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); handleAdvanceStatus(order.id, order.status); }}
                          >
                            {nextAction}
                          </button>
                        )}
                        <span className="text-text-muted text-sm">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border">
                      <div className="mt-3 flex flex-col gap-2">
                        {order.itens.map((item, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-bg-base rounded-md text-sm">
                            <span className="font-medium">{item.nome}</span>
                            <span className="text-text-muted">{item.tipo} • {item.tamanho}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Financial summary for sent packages */}
      {sentPackages.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg text-primary mb-3">📊 Resumo Financeiro dos Pacotes</h3>
          <div className="flex flex-col gap-4">
            {sentPackages.map((pkg, idx) => {
              const nonAdminOrders = pkg.orders.filter(o => !o.admin_order);
              const totalVendido = nonAdminOrders.reduce((sum, o) => sum + o.total, 0);
              const totalCamisasVendidas = nonAdminOrders.reduce((sum, o) => sum + o.itens.length, 0);
              const custoPacoteValue = parseFloat(pkg.custoPacote) || 0;
              const freteValue = parseFloat(pkg.frete) || 0;
              const taxaImportacaoValue = parseFloat(pkg.taxaImportacao) || 0;

              const FEE_RATES: Record<string, number> = {
                pix: 0.0199,
                credit_card: 0.0499,
                debit_card: 0.0399,
              };
              const totalTaxas = nonAdminOrders.reduce((sum, o) => {
                const rate = FEE_RATES[o.payment_method || ""] ?? 0.0499;
                return sum + o.total * rate;
              }, 0);

              const lucro = totalVendido - custoPacoteValue - freteValue - taxaImportacaoValue - totalTaxas;

              return (
                <div key={idx} className="bg-card-bg rounded-md p-4 shadow-card">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-primary">Pacote {idx + 1} — {pkg.orders.length} pedido(s) • {pkg.orders.reduce((s, o) => s + o.itens.length, 0)} camisas</h4>
                    <div className="flex gap-1 flex-wrap">
                      {pkg.orders.map((o) => (
                        <span key={o.id} className="text-xs bg-bg-base px-2 py-0.5 rounded">{o.id}</span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Camisas vendidas (excl. admin):</span>
                      <span>{totalCamisasVendidas}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Valor vendido (excl. admin):</span>
                      <span className="font-semibold">{formatarMoeda(totalVendido)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Custo do pacote:</span>
                      <span>{formatarMoeda(custoPacoteValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Taxas Mercado Pago:</span>
                      <span>{formatarMoeda(totalTaxas)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Frete:</span>
                      <span>{formatarMoeda(freteValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Taxa de importação:</span>
                      <span>{formatarMoeda(taxaImportacaoValue)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                      <span>Lucro:</span>
                      <span className={lucro >= 0 ? "text-green-600" : "text-red-500"}>{formatarMoeda(lucro)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available paid orders */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h2 className="text-xl text-primary m-0">Montar Pacote</h2>
          <p className="text-sm text-text-muted mt-1">
            Selecione pedidos pagos para enviar ao fornecedor. Máximo 8 camisas por pacote.
          </p>
        </div>
        <button
          className="px-3 py-2 text-sm font-semibold bg-accent/10 text-accent rounded-md cursor-pointer hover:bg-accent/20 transition-colors whitespace-nowrap"
          onClick={loadOrders}
        >
          ↻ Atualizar
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <p className="text-4xl mb-4">📦</p>
          <p>Nenhum pedido pago disponível para montar pacote.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {orders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              const disabled = !isSelected && wouldExceed(order);
              const paymentLabel = order.payment_method
                ? PAYMENT_LABELS[order.payment_method] || order.payment_method
                : null;

              return (
                <div
                  key={order.id}
                  className={`bg-card-bg rounded-md shadow-card overflow-hidden transition-opacity ${
                    disabled ? "opacity-50" : ""
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        disabled={disabled}
                        onClick={() => toggleOrder(order.id)}
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-colors cursor-pointer disabled:cursor-not-allowed ${
                          isSelected
                            ? "bg-green-600 border-green-600 text-white"
                            : disabled
                            ? "bg-gray-100 border-gray-300"
                            : "bg-white border-gray-400 hover:border-green-500"
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-lg text-primary">{order.id}</span>
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                            Pago
                          </span>
                          {paymentLabel && (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                              {paymentLabel}
                            </span>
                          )}
                        </div>
                        {order.endereco && (
                          <div className="text-sm text-text-muted mt-1">
                            {order.endereco.nome} • {order.endereco.cidade}/{order.endereco.estado}
                          </div>
                        )}
                        <div className="text-sm text-text-muted mt-0.5">
                          {order.data} às {order.hora}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-accent">
                          {formatarMoeda(order.total)}
                        </div>
                        <div className="text-sm text-text-muted">
                          {order.itens.length} camisa{order.itens.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedIds.size > 0 && (
            <div className="sticky bottom-0 bg-card-bg border-t border-border p-4 mt-4 flex items-center justify-between shadow-lg">
              <div>
                <span className="font-bold">{selectedIds.size} pedido(s)</span>
                <span className="text-text-muted ml-3">{totalShirts}/8 camisas</span>
              </div>
              <button
                onClick={() => setStep("review")}
                className="px-6 py-3 bg-primary text-white rounded-md font-semibold hover:bg-primary/90 transition-colors"
              >
                Montar Pacote →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
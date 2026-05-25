import { useState, useEffect, useCallback } from "react";
import { getPedidos, updatePedidoStatus, getPacotes, createPacote, updatePacoteStatus, updatePacoteFinanceiro } from "./lib/db";
import type { Order } from "./types";
import type { Pacote } from "./lib/db";
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

const STATUS_PIPELINE = [
  "enviado_fornecedor",
  "em_producao",
  "a_caminho",
  "em_estoque",
  "em_entrega",
  "entregue",
] as const;

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  enviado_fornecedor: { label: "Enviado", bg: "bg-blue-100", text: "text-blue-800" },
  em_producao: { label: "Em produção", bg: "bg-purple-100", text: "text-purple-800" },
  a_caminho: { label: "A caminho", bg: "bg-indigo-100", text: "text-indigo-800" },
  em_estoque: { label: "Em estoque", bg: "bg-teal-100", text: "text-teal-800" },
  em_entrega: { label: "Em entrega", bg: "bg-cyan-100", text: "text-cyan-800" },
  entregue: { label: "Entregue", bg: "bg-green-100", text: "text-green-800" },
};

const NEXT_STATUS: Record<string, string> = {
  enviado_fornecedor: "em_producao",
  em_producao: "a_caminho",
  a_caminho: "em_estoque",
  em_estoque: "em_entrega",
  em_entrega: "entregue",
};

const STATUS_ACTION_LABELS: Record<string, string> = {
  enviado_fornecedor: "Em Produção",
  em_producao: "A Caminho",
  a_caminho: "Em Estoque",
  em_estoque: "Em Entrega",
  em_entrega: "Entregue",
};

const FEE_RATES: Record<string, number> = {
  pix: 0.0199,
  credit_card: 0.0499,
  debit_card: 0.0399,
};

type Tab = "montar" | "pacotes" | "historico";
type Step = "select" | "review";

export default function AdminPacotes() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [tab, setTab] = useState<Tab>("montar");
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [showAllHistorico, setShowAllHistorico] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const [all, pacotesData] = await Promise.all([getPedidos(), getPacotes()]);
      setAllOrders(all);
      setOrders(all.filter((o) => o.status === "pago"));
      setPacotes(pacotesData);
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

  // Split pacotes into active (not entregue) and delivered
  const activePacotes = pacotes.filter((p) => p.status !== "entregue");
  const deliveredPacotes = pacotes.filter((p) => p.status === "entregue");

  const wouldExceed = (order: Order): boolean => {
    if (selectedIds.has(order.id)) return false;
    if (selectedIds.size === 0) return false;
    return totalShirts + order.itens.length > 8;
  };

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Get order by ID from allOrders
  function getOrderById(id: string): Order | undefined {
    return allOrders.find((o) => o.id === id);
  }

  async function handleSend() {
    if (selectedOrders.length === 0) return;

    setSending(true);
    try {
      const msg = montarMensagemPacote(selectedOrders);
      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank");

      // Update all orders to enviado_fornecedor
      await Promise.all(selectedOrders.map((o) => updatePedidoStatus(o.id, "enviado_fornecedor")));

      // Create pacote in DB
      const novoPacote = await createPacote(selectedOrders.map((o) => o.id));

      setOrders((prev) => prev.filter((o) => !selectedIds.has(o.id)));
      setSelectedIds(new Set());
      setStep("select");
      setPacotes((prev) => [novoPacote, ...prev]);
      setTab("pacotes");
    } catch (err) {
      console.error("Erro ao enviar pacote:", err);
      alert("Erro ao criar pacote. Verifique manualmente.");
    } finally {
      setSending(false);
    }
  }

  async function handleAdvancePackage(pacote: Pacote) {
    const nextStatus = NEXT_STATUS[pacote.status];
    if (!nextStatus) return;

    const label = STATUS_ACTION_LABELS[pacote.status] || nextStatus;
    if (!confirm(`Avançar Pacote para "${label}"?`)) return;

    try {
      // Update all orders in this pacote
      await Promise.all(pacote.pedido_ids.map((id) => updatePedidoStatus(id, nextStatus)));
      // Update pacote status
      await updatePacoteStatus(pacote.id, nextStatus);

      setPacotes((prev) =>
        prev.map((p) => p.id === pacote.id ? { ...p, status: nextStatus } : p)
      );
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      alert("Erro ao atualizar status. Verifique manualmente.");
    }
  }

  async function handleSaveFinanceiro(pacote: Pacote, field: "custo" | "frete" | "taxa_importacao", value: string) {
    const numValue = value === "" ? null : parseFloat(value);
    const update = { custo: pacote.custo, frete: pacote.frete, taxa_importacao: pacote.taxa_importacao };
    update[field] = numValue;

    try {
      await updatePacoteFinanceiro(pacote.id, update);
      setPacotes((prev) =>
        prev.map((p) => p.id === pacote.id ? { ...p, ...update } : p)
      );
    } catch (err) {
      console.error("Erro ao salvar financeiro:", err);
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
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">Pago</span>
                  {order.payment_method && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                      {PAYMENT_LABELS[order.payment_method] || order.payment_method}
                    </span>
                  )}
                  {order.admin_order && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">👤 Admin</span>
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
                    const version = item.feminino && item.genero === "Feminino" ? `${tipoEn} WOMANS` : `${tipoEn} MALE`;
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
                        <div className="text-xs text-text-muted mt-1 truncate">{item.yupooUrl || "N/A"}</div>
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

  // ── Main view with tabs ──
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Tab navigation */}
      <div className="flex border-b border-border mb-6">
        <button
          className={`px-4 py-2 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
            tab === "montar" ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text-main"
          }`}
          onClick={() => setTab("montar")}
        >
          📦 Montar
          {orders.length > 0 && (
            <span className="ml-2 inline-block px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-800">{orders.length}</span>
          )}
        </button>
        <button
          className={`px-4 py-2 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
            tab === "pacotes" ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text-main"
          }`}
          onClick={() => setTab("pacotes")}
        >
          🚚 Pacotes
          {activePacotes.length > 0 && (
            <span className="ml-2 inline-block px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">{activePacotes.length}</span>
          )}
        </button>
        <button
          className={`px-4 py-2 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
            tab === "historico" ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text-main"
          }`}
          onClick={() => setTab("historico")}
        >
          📊 Histórico
          {deliveredPacotes.length > 0 && (
            <span className="ml-2 inline-block px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-800">{deliveredPacotes.length}</span>
          )}
        </button>
      </div>

      {/* ── Tab: Montar Pacote ── */}
      {tab === "montar" && (
        <>
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
                  const paymentLabel = order.payment_method ? PAYMENT_LABELS[order.payment_method] || order.payment_method : null;

                  return (
                    <div key={order.id} className={`bg-card-bg rounded-md shadow-card overflow-hidden transition-opacity ${disabled ? "opacity-50" : ""}`}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <button
                            type="button" role="checkbox" aria-checked={isSelected} disabled={disabled}
                            onClick={() => toggleOrder(order.id)}
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-colors cursor-pointer disabled:cursor-not-allowed ${
                              isSelected ? "bg-green-600 border-green-600 text-white"
                                : disabled ? "bg-gray-100 border-gray-300"
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
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">Pago</span>
                              {paymentLabel && (
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">{paymentLabel}</span>
                              )}
                            </div>
                            {order.endereco && (
                              <div className="text-sm text-text-muted mt-1">{order.endereco.nome} • {order.endereco.cidade}/{order.endereco.estado}</div>
                            )}
                            <div className="text-sm text-text-muted mt-0.5">{order.data} às {order.hora}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-lg text-accent">{formatarMoeda(order.total)}</div>
                            <div className="text-sm text-text-muted">{order.itens.length} camisa{order.itens.length !== 1 ? "s" : ""}</div>
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
        </>
      )}

      {/* ── Tab: Pacotes (ativos) ── */}
      {tab === "pacotes" && (
        <>
          {activePacotes.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              <p className="text-4xl mb-4">🚚</p>
              <p>Nenhum pacote em andamento.</p>
              <p className="text-sm mt-2">Monte um pacote na aba "Montar" para começar.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {activePacotes.map((pacote) => {
                const statusInfo = STATUS_LABELS[pacote.status] || STATUS_LABELS.enviado_fornecedor;
                const nextAction = STATUS_ACTION_LABELS[pacote.status];
                const isExpanded = expandedPkg === pacote.id;
                const totalShirtsPkg = pacote.pedido_ids.reduce((s, id) => {
                  const o = getOrderById(id);
                  return s + (o?.itens.length ?? 0);
                }, 0);

                return (
                  <div key={pacote.id} className="bg-card-bg rounded-md shadow-card overflow-hidden">
                    <div
                      className="p-4 cursor-pointer hover:bg-bg-base transition-colors"
                      onClick={() => setExpandedPkg(isExpanded ? null : pacote.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-lg text-primary">Pacote {pacote.id.slice(0, 8)}</span>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusInfo.bg} ${statusInfo.text}`}>
                              {statusInfo.label}
                            </span>
                            <span className="text-sm text-text-muted">
                              {pacote.pedido_ids.length} pedido(s) • {totalShirtsPkg} camisas
                            </span>
                          </div>
                          <div className="flex gap-1 flex-wrap mt-1">
                            {pacote.pedido_ids.map((id) => (
                              <span key={id} className="text-xs bg-bg-base px-2 py-0.5 rounded">{id}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {nextAction && (
                            <button
                              className="px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleAdvancePackage(pacote); }}
                            >
                              → {nextAction}
                            </button>
                          )}
                          <span className="text-text-muted text-sm">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Status pipeline */}
                      <div className="flex items-center gap-1 mt-3">
                        {STATUS_PIPELINE.map((s, i) => {
                          const currentIdx = STATUS_PIPELINE.indexOf(pacote.status as typeof STATUS_PIPELINE[number]);
                          const isDone = i <= currentIdx;
                          const isCurrent = s === pacote.status;
                          const sl = STATUS_LABELS[s];
                          return (
                            <div key={s} className="flex items-center">
                              {i > 0 && <div className={`h-0.5 w-2 ${i <= currentIdx ? "bg-green-500" : "bg-gray-200"}`} />}
                              <div className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                isCurrent ? "bg-accent text-white"
                                  : isDone ? `${sl.bg} ${sl.text}`
                                  : "bg-gray-100 text-gray-400"
                              }`}>
                                {sl.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border">
                        <h4 className="text-sm font-semibold text-text-muted mb-2 mt-3">Pedidos neste pacote:</h4>
                        <div className="flex flex-col gap-2">
                          {pacote.pedido_ids.map((id) => {
                            const order = getOrderById(id);
                            if (!order) return <div key={id} className="text-sm text-text-muted">Pedido {id} não encontrado</div>;
                            return (
                              <div key={id} className="p-3 bg-bg-base rounded-md">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-primary">{order.id}</span>
                                    {order.payment_method && (
                                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                                        {PAYMENT_LABELS[order.payment_method] || order.payment_method}
                                      </span>
                                    )}
                                    {order.admin_order && (
                                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">👤</span>
                                    )}
                                  </div>
                                  <span className="font-semibold text-sm">{formatarMoeda(order.total)}</span>
                                </div>
                                <div className="text-xs text-text-muted mt-1">
                                  {order.endereco?.nome} • {order.itens.length} camisa{order.itens.length !== 1 ? "s" : ""}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {order.itens.map((item, i) => (
                                    <span key={i} className="text-xs bg-white px-1.5 py-0.5 rounded border border-border">
                                      {item.nome} ({item.tamanho})
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Histórico (pacotes entregues + financeiro) ── */}
      {tab === "historico" && (
        <>
          {deliveredPacotes.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              <p className="text-4xl mb-4">📊</p>
              <p>Nenhum pacote entregue ainda.</p>
              <p className="text-sm mt-2">Os pacotes entregues aparecerão aqui com o resumo financeiro.</p>
            </div>
          ) : (
            <>
              {/* Profit summary at top */}
              <ProfitSummary pacotes={deliveredPacotes} allOrders={allOrders} />

              {/* Delivered packages list */}
              <div className="flex flex-col gap-4 mt-6">
                {(showAllHistorico ? deliveredPacotes : deliveredPacotes.slice(0, 5)).map((pacote) => (
                  <DeliveredPacoteCard
                    key={pacote.id}
                    pacote={pacote}
                    allOrders={allOrders}
                    onSaveFinanceiro={handleSaveFinanceiro}
                  />
                ))}
              </div>

              {deliveredPacotes.length > 5 && (
                <div className="text-center mt-4">
                  <button
                    className="px-4 py-2 text-sm font-semibold text-accent hover:underline cursor-pointer"
                    onClick={() => setShowAllHistorico(!showAllHistorico)}
                  >
                    {showAllHistorico ? "Mostrar menos" : `Mostrar mais (${deliveredPacotes.length - 5} restantes)`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Profit Summary Component ──
function ProfitSummary({ pacotes, allOrders }: { pacotes: Pacote[]; allOrders: Order[] }) {
  let totalVendido = 0;
  let totalCamisas = 0;
  let totalCusto = 0;
  let totalFrete = 0;
  let totalTaxaImportacao = 0;
  let totalTaxasMP = 0;

  for (const pacote of pacotes) {
    const orders = pacote.pedido_ids
      .map((id) => allOrders.find((o) => o.id === id))
      .filter((o): o is Order => !!o && !o.admin_order);

    const vendido = orders.reduce((sum, o) => sum + o.total, 0);
    const camisas = orders.reduce((sum, o) => sum + o.itens.length, 0);
    const taxas = orders.reduce((sum, o) => {
      const rate = FEE_RATES[o.payment_method || ""] ?? 0.0499;
      return sum + o.total * rate;
    }, 0);

    totalVendido += vendido;
    totalCamisas += camisas;
    totalCusto += pacote.custo ?? 0;
    totalFrete += pacote.frete ?? 0;
    totalTaxaImportacao += pacote.taxa_importacao ?? 0;
    totalTaxasMP += taxas;
  }

  const lucro = totalVendido - totalCusto - totalFrete - totalTaxaImportacao - totalTaxasMP;
  const hasAnyFinanceiro = pacotes.some((p) => p.custo !== null || p.frete !== null || p.taxa_importacao !== null);

  return (
    <div className="bg-card-bg rounded-md p-5 shadow-card">
      <h3 className="text-lg font-bold text-primary mb-4">📊 Resumo de Lucros</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-text-muted">Total de pacotes entregues:</span>
          <span className="font-semibold">{pacotes.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Camisas vendidas (excl. admin):</span>
          <span className="font-semibold">{totalCamisas}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Valor vendido (excl. admin):</span>
          <span className="font-semibold">{formatarMoeda(totalVendido)}</span>
        </div>
        <div className="border-t border-border pt-2 mt-2" />
        <div className="flex justify-between">
          <span className="text-text-muted">Custo total dos pacotes:</span>
          <span>{formatarMoeda(totalCusto)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Frete total:</span>
          <span>{formatarMoeda(totalFrete)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Taxa de importação total:</span>
          <span>{formatarMoeda(totalTaxaImportacao)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Taxas Mercado Pago:</span>
          <span>{formatarMoeda(totalTaxasMP)}</span>
        </div>
        <div className="border-t border-border pt-2 mt-2" />
        <div className="flex justify-between font-bold text-lg">
          <span>Lucro total:</span>
          <span className={lucro >= 0 ? "text-green-600" : "text-red-500"}>{formatarMoeda(lucro)}</span>
        </div>
        {!hasAnyFinanceiro && (
          <p className="text-xs text-text-muted mt-2 italic">
            Preencha os dados financeiros de cada pacote abaixo para ver o lucro real.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Delivered Pacote Card Component ──
function DeliveredPacoteCard({
  pacote,
  allOrders,
  onSaveFinanceiro,
}: {
  pacote: Pacote;
  allOrders: Order[];
  onSaveFinanceiro: (pacote: Pacote, field: "custo" | "frete" | "taxa_importacao", value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localCusto, setLocalCusto] = useState(pacote.custo?.toString() ?? "");
  const [localFrete, setLocalFrete] = useState(pacote.frete?.toString() ?? "");
  const [localTaxa, setLocalTaxa] = useState(pacote.taxa_importacao?.toString() ?? "");

  const orders = pacote.pedido_ids
    .map((id) => allOrders.find((o) => o.id === id))
    .filter((o): o is Order => !!o);

  const nonAdminOrders = orders.filter((o) => !o.admin_order);
  const totalVendido = nonAdminOrders.reduce((sum, o) => sum + o.total, 0);
  const totalCamisas = orders.reduce((sum, o) => sum + o.itens.length, 0);
  const totalCamisasVendidas = nonAdminOrders.reduce((sum, o) => sum + o.itens.length, 0);
  const custoValue = parseFloat(localCusto) || 0;
  const freteValue = parseFloat(localFrete) || 0;
  const taxaValue = parseFloat(localTaxa) || 0;
  const totalTaxas = nonAdminOrders.reduce((sum, o) => {
    const rate = FEE_RATES[o.payment_method || ""] ?? 0.0499;
    return sum + o.total * rate;
  }, 0);
  const lucro = totalVendido - custoValue - freteValue - taxaValue - totalTaxas;

  return (
    <div className="bg-card-bg rounded-md shadow-card overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-bg-base transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-primary">Pacote {pacote.id.slice(0, 8)}</span>
              <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">Entregue</span>
              <span className="text-sm text-text-muted">
                {orders.length} pedido(s) • {totalCamisas} camisas
              </span>
            </div>
            <div className="flex gap-1 flex-wrap mt-1">
              {pacote.pedido_ids.map((id) => (
                <span key={id} className="text-xs bg-bg-base px-2 py-0.5 rounded">{id}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-bold text-sm">{formatarMoeda(totalVendido)}</div>
              <div className="text-xs text-text-muted">vendido</div>
            </div>
            <span className="text-text-muted text-sm">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          {/* Financial inputs */}
          <div className="mt-4 mb-4 p-3 bg-green-50 rounded-md border border-green-200">
            <h4 className="text-sm font-semibold text-green-800 mb-3">💰 Dados Financeiros</h4>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <label className="block text-xs text-green-700 mb-1">Custo do pacote (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={localCusto}
                  onChange={(e) => setLocalCusto(e.target.value)}
                  onBlur={() => onSaveFinanceiro(pacote, "custo", localCusto)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-green-300 rounded-md bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-green-700 mb-1">Frete (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={localFrete}
                  onChange={(e) => setLocalFrete(e.target.value)}
                  onBlur={() => onSaveFinanceiro(pacote, "frete", localFrete)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-green-300 rounded-md bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-green-700 mb-1">Taxa de importação (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={localTaxa}
                  onChange={(e) => setLocalTaxa(e.target.value)}
                  onBlur={() => onSaveFinanceiro(pacote, "taxa_importacao", localTaxa)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-green-300 rounded-md bg-white text-sm"
                />
              </div>
            </div>

            {/* Per-package summary */}
            <div className="mt-3 pt-3 border-t border-green-200 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-green-700">Camisas vendidas (excl. admin):</span>
                <span className="font-medium">{totalCamisasVendidas}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Valor vendido (excl. admin):</span>
                <span className="font-semibold">{formatarMoeda(totalVendido)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Custo do pacote:</span>
                <span>{formatarMoeda(custoValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Taxas Mercado Pago:</span>
                <span>{formatarMoeda(totalTaxas)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Frete:</span>
                <span>{formatarMoeda(freteValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Taxa de importação:</span>
                <span>{formatarMoeda(taxaValue)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-green-200">
                <span>Lucro:</span>
                <span className={lucro >= 0 ? "text-green-700" : "text-red-600"}>{formatarMoeda(lucro)}</span>
              </div>
            </div>
          </div>

          {/* Orders in this package */}
          <h4 className="text-sm font-semibold text-text-muted mb-2">Pedidos neste pacote:</h4>
          <div className="flex flex-col gap-2">
            {orders.map((order) => (
              <div key={order.id} className="p-3 bg-bg-base rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-primary">{order.id}</span>
                    {order.payment_method && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                        {PAYMENT_LABELS[order.payment_method] || order.payment_method}
                      </span>
                    )}
                    {order.admin_order && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">👤</span>
                    )}
                  </div>
                  <span className="font-semibold text-sm">{formatarMoeda(order.total)}</span>
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {order.endereco?.nome} • {order.itens.length} camisa{order.itens.length !== 1 ? "s" : ""}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {order.itens.map((item, i) => (
                    <span key={i} className="text-xs bg-white px-1.5 py-0.5 rounded border border-border">
                      {item.nome} ({item.tamanho})
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
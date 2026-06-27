import { useState, useEffect, useCallback, useMemo } from "react";
import { getPedidos, updatePedidoStatus, getPacotes, createPacote, updatePacoteStatus, updatePacoteFinanceiro, removePedidoFromPacote, deletePacote, getProdutos } from "./lib/db";
import type { Order, OrderItem } from "./types";
import type { Pacote, DbProduto } from "./lib/db";
import { montarMensagemItem, formatarMoeda, TAMANHO_FORNECEDOR, yupooThumbnailUrl } from "./types";
import type { LojaConfig } from "./types";
import { PAYMENT_LABELS_SHORT, TIPO_ENGLISH, PACKAGE_STATUS_PIPELINE, PACKAGE_STATUS_LABELS, PACKAGE_NEXT_STATUS, PACKAGE_PREV_STATUS, PACKAGE_PREV_ACTION_LABELS, PACKAGE_STATUS_ACTION_LABELS, getMPFeeRate } from "./lib/status";

type Tab = "montar" | "pacotes" | "historico";
type Step = "select" | "review";

interface SharingState {
  items: OrderItem[];
  index: number;
  onDone: () => void;
}

export default function AdminPacotes({ config }: { config: LojaConfig }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [produtos, setProdutos] = useState<DbProduto[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [tab, setTab] = useState<Tab>("montar");
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [showAllHistorico, setShowAllHistorico] = useState(false);
  const [custosPacote, setCustosPacote] = useState<Pacote | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState<SharingState | null>(null);

  // Lock body scroll when sharing modal is open
  useEffect(() => {
    if (sharing) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sharing]);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const [all, pacotesData, prods] = await Promise.all([getPedidos(), getPacotes(), getProdutos()]);
      setAllOrders(all);
      // Only show "pago" orders that are NOT already in a pacote
      const inPacote = new Set(pacotesData.flatMap((p) => p.pedido_ids));
      setOrders(all.filter((o) => o.status === "pago" && !inPacote.has(o.id)));
      setPacotes(pacotesData);
      setProdutos(prods);
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

  const orderMap = useMemo(() => new Map(allOrders.map((o) => [o.id, o])), [allOrders]);
  const productMap = useMemo(() => new Map(produtos.map((p) => [p.yupoo_url, p])), [produtos]);

  function getOrderById(id: string): Order | undefined {
    return orderMap.get(id);
  }

  function getProductImage(yupooUrl: string, feminino?: boolean): string {
    if (!yupooUrl) return "";
    const prod = productMap.get(yupooUrl);
    if (!prod) return "";
    if (feminino && prod.imagem_urls_feminina && prod.imagem_urls_feminina.length > 0) {
      return yupooThumbnailUrl(prod.imagem_urls_feminina[0], "medium");
    }
    if (prod.imagem_urls?.length > 0) {
      return yupooThumbnailUrl(prod.imagem_urls[0], "medium");
    }
    return "";
  }

  // Share single item via Web Share API (mobile) or clipboard (desktop)
  async function shareItem(item: OrderItem) {
    const msg = montarMensagemItem(item);
    const img = getProductImage(item.yupooUrl, item.feminino && item.genero === "Feminino");
    const imageUrls = img ? [img] : [];

    // Try Web Share API with files first (image + text)
    if (imageUrls.length > 0 && navigator.share && navigator.canShare) {
      try {
        const blobs = await Promise.all(
          imageUrls.map(async (url) => {
            const res = await fetch(url);
            const blob = await res.blob();
            return new File([blob], `camisa-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
          })
        );
        const shareData = { text: msg, files: blobs };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Fall through to text-only share
      }
    }

    // Try text-only Web Share API (works even without images)
    if (navigator.share) {
      try {
        await navigator.share({ text: msg });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Copy single item info (formatted) to clipboard
  function handleCopyItem(item: OrderItem) {
    const msg = montarMensagemItem(item);
    navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSend() {
    if (selectedOrders.length === 0) return;
    setSending(true);
    try {
      // Create pacote in DB — orders stay as "pago", sharing happens when advancing to "enviado_fornecedor"
      const novoPacote = await createPacote(selectedOrders.map((o) => o.id));

      // Remove orders from the "pago" list (they're now in a pacote)
      setOrders((prev) => prev.filter((o) => !selectedIds.has(o.id)));
      setSelectedIds(new Set());
      setStep("select");
      setPacotes((prev) => [novoPacote, ...prev]);
      setTab("pacotes");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao criar pacote. Verifique manualmente.";
      console.error("Erro ao criar pacote:", msg);
      if (msg.includes("8 camisas") || msg.includes("limite")) {
        alert(`Erro: ${msg}`);
      } else {
        alert(msg);
      }
    }
    setSending(false);
  }

  async function handleAdvancePackage(pacote: Pacote) {
    const nextStatus = PACKAGE_NEXT_STATUS[pacote.status];
    if (!nextStatus) return;

    const label = PACKAGE_STATUS_ACTION_LABELS[pacote.status] || nextStatus;
    if (!confirm(`Avançar Pacote para "${label}"?`)) return;

    // If advancing from "pago" to "enviado_fornecedor", share items one by one
    if (pacote.status === "pago") {
      const pacoteOrders = pacote.pedido_ids
        .map((id) => allOrders.find((o) => o.id === id))
        .filter((o): o is Order => !!o);
      if (pacoteOrders.length > 0) {
        const items = pacoteOrders.flatMap((o) => o.itens);
        setSharing({
          items,
          index: 0,
          onDone: async () => {
            try {
              await Promise.all(pacote.pedido_ids.map((id) => updatePedidoStatus(id, nextStatus)));
              await updatePacoteStatus(pacote.id, nextStatus);
              setPacotes((prev) =>
                prev.map((p) => p.id === pacote.id ? { ...p, status: nextStatus } : p)
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "Erro ao atualizar status. Verifique manualmente.";
              console.error("Erro ao atualizar status:", msg);
              alert(msg);
            }
            setSharing(null);
          },
        });
        return; // Don't proceed with status update here — onDone handles it
      }
    }

    try {
      // Update all orders in this pacote
      await Promise.all(pacote.pedido_ids.map((id) => updatePedidoStatus(id, nextStatus)));
      // Update pacote status
      await updatePacoteStatus(pacote.id, nextStatus);

      setPacotes((prev) =>
        prev.map((p) => p.id === pacote.id ? { ...p, status: nextStatus } : p)
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar status. Verifique manualmente.";
      console.error("Erro ao atualizar status:", msg);
      alert(msg);
    }
  }

  async function handleRevertPackage(pacote: Pacote) {
    const prevStatus = PACKAGE_PREV_STATUS[pacote.status];
    if (!prevStatus) return;

    const label = PACKAGE_PREV_ACTION_LABELS[pacote.status] || prevStatus;
    if (!confirm(`Voltar Pacote para "${label}"?`)) return;

    try {
      await Promise.all(pacote.pedido_ids.map((id) => updatePedidoStatus(id, prevStatus)));
      await updatePacoteStatus(pacote.id, prevStatus);

      setPacotes((prev) =>
        prev.map((p) => p.id === pacote.id ? { ...p, status: prevStatus } : p)
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao voltar status. Verifique manualmente.";
      console.error("Erro ao voltar status:", msg);
      alert(msg);
    }
  }

  async function handleSaveFinanceiro(pacote: Pacote, field: "custo" | "frete" | "taxa_importacao", value: string) {
    const numValue = value === "" ? null : parseFloat(value);
    try {
      const update = { custo: pacote.custo ?? null, frete: pacote.frete ?? null, taxa_importacao: pacote.taxa_importacao ?? null, [field]: numValue };
      await updatePacoteFinanceiro(pacote.id, update);
      setPacotes((prev) =>
        prev.map((p) => p.id === pacote.id ? { ...p, ...update } : p)
      );
    } catch (err) {
      console.error("Erro ao salvar financeiro:", err);
    }
  }

  async function handleSaveAllFinanceiro(pacote: Pacote, values: { custo: number | null; frete: number | null; taxa_importacao: number | null; dolar_rate?: number | null }) {
    try {
      await updatePacoteFinanceiro(pacote.id, values);
      setPacotes((prev) =>
        prev.map((p) => p.id === pacote.id ? { ...p, ...values } : p)
      );
      setMensagem("Custos salvos com sucesso!");
      setTimeout(() => setMensagem(""), 3000);
    } catch (err) {
      console.error("Erro ao salvar financeiro:", err);
    }
  }

  async function handleRemovePedido(pacoteId: string, pedidoId: string) {
    if (!confirm(`Remover pedido ${pedidoId} deste pacote?`)) return;
    try {
      const updated = await removePedidoFromPacote(pacoteId, pedidoId);
      setPacotes((prev) => prev.map((p) => p.id === pacoteId ? updated : p));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao remover pedido do pacote.";
      console.error("Erro ao remover pedido do pacote:", msg);
      alert(msg);
    }
  }

  async function handleDeletePacote(pacoteId: string) {
    if (!confirm("Excluir este pacote do histórico? Os pedidos não serão excluídos.")) return;
    try {
      await deletePacote(pacoteId);
      setPacotes((prev) => prev.filter((p) => p.id !== pacoteId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir pacote.";
      console.error("Erro ao excluir pacote:", msg);
      alert(msg);
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
                      {PAYMENT_LABELS_SHORT[order.payment_method] || order.payment_method}
                    </span>
                  )}
                  {order.admin_order && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">👤 Admin</span>
                  )}
                  {order.pronta_entrega && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-800">📦 Estoque</span>
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
                    const version = item.feminino && item.genero === "Feminino" ? `${tipoEn} WOMENS` : `${tipoEn}`;
                    const img = getProductImage(item.yupooUrl, item.feminino && item.genero === "Feminino");
                    return (
                      <div key={i} className="p-3 bg-bg-base rounded-md">
                        <div className="flex gap-3">
                          {img && (
                            <img src={img} alt={item.nome} width={64} height={64} className="w-16 h-16 object-cover rounded flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{item.nome}</span>
                              <button
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-text-muted hover:bg-accent hover:text-white transition-colors cursor-pointer"
                                title="Copiar informações do item"
                                onClick={() => handleCopyItem(item)}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copiar
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted mt-1">
                              <span>Size: {TAMANHO_FORNECEDOR[item.tamanho] || item.tamanho}</span>
                              <span>Version: {version}</span>
                            </div>
                            {item.personalizado && (
                              <div className="text-xs text-accent font-semibold mt-1">
                                Name: {item.nomePersonalizado} / Number: {item.numeroPersonalizado}
                              </div>
                            )}
                          </div>
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
            {sending ? "Criando..." : "✓ Confirmar Pacote"}
          </button>
        </div>
      </div>
    );
  }

  // ── Main view with tabs ──
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Tab navigation */}
      <div className="flex flex-wrap border-b border-border mb-6">
        <button
          className={`px-3 sm:px-4 py-2 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
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
          className={`px-3 sm:px-4 py-2 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
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
          className={`px-3 sm:px-4 py-2 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
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
                Passo 1: Selecione os pedidos pagos abaixo (máx. 8 camisas). Passo 2: Revise e envie ao fornecedor.
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
                  const paymentLabel = order.payment_method ? PAYMENT_LABELS_SHORT[order.payment_method] || order.payment_method : null;

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
                              {order.pronta_entrega && (
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-800">📦 Estoque</span>
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
              <p className="text-sm mt-2">Acompanhe aqui os pacotes enviados ao fornecedor. Monte um pacote na aba "Montar" para começar.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {activePacotes.map((pacote) => {
                const statusInfo = PACKAGE_STATUS_LABELS[pacote.status] || PACKAGE_STATUS_LABELS.enviado_fornecedor;
                const nextAction = PACKAGE_STATUS_ACTION_LABELS[pacote.status];
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
                              {pacote.status === "em_estoque" && "📦 "}{statusInfo.label}
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
                          {PACKAGE_PREV_STATUS[pacote.status] && (
                            <button
                              className="px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded-md cursor-pointer hover:bg-gray-300 transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleRevertPackage(pacote); }}
                            >
                              ← Voltar
                            </button>
                          )}
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
                      <div className="flex flex-wrap items-center gap-1 mt-3">
                        {PACKAGE_STATUS_PIPELINE.map((s, i) => {
                          const currentIdx = PACKAGE_STATUS_PIPELINE.indexOf(pacote.status as typeof PACKAGE_STATUS_PIPELINE[number]);
                          const isDone = i <= currentIdx;
                          const isCurrent = s === pacote.status;
                          const sl = PACKAGE_STATUS_LABELS[s];
                          return (
                            <div key={s} className="flex items-center">
                              {i > 0 && <div className={`h-0.5 w-2 ${i <= currentIdx ? "bg-green-500" : "bg-gray-200"}`} />}
                              <div className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                isCurrent ? "bg-accent text-white"
                                  : isDone ? `${sl.bg} ${sl.text}`
                                  : "bg-gray-100 text-gray-400"
                              }`}>
                                {s === "em_estoque" && "📦 "}{sl.label}
                              </div>
                            </div>
                          );
                        })}
                        <button
                          className="ml-auto px-2 py-1 text-[11px] font-semibold bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setCustosPacote(pacote); }}
                          title="Preencher custos do pacote"
                        >
                          💰 Custos
                        </button>
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
                                        {PAYMENT_LABELS_SHORT[order.payment_method] || order.payment_method}
                                      </span>
                                    )}
                                    {order.admin_order && (
                                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">👤</span>
                                    )}
                                    {order.pronta_entrega && (
                                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-800">📦</span>
                                    )}
                                  </div>
                                  <span className="font-semibold text-sm">{formatarMoeda(order.total)}</span>
                                </div>
                                <div className="text-xs text-text-muted mt-1">
                                  {order.endereco?.nome} • {order.itens.length} camisa{order.itens.length !== 1 ? "s" : ""}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {order.itens.map((item, i) => {
                                    const img = getProductImage(item.yupooUrl, item.feminino && item.genero === "Feminino");
                                    return (
<div key={i} className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-border">
                                          {img && (
                                            <img src={img} alt={item.nome} width={32} height={32} className="w-8 h-8 object-cover rounded flex-shrink-0" />
                                          )}
                                          <span className="text-xs">{item.nome} ({item.tamanho})</span>
                                          <button
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-text-muted hover:bg-accent hover:text-white transition-colors cursor-pointer"
                                            title="Copiar informações do item"
                                            onClick={() => handleCopyItem(item)}
                                          >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                          </button>
                                        </div>
                                    );
                                  })}
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
                    config={config}
                    onSaveFinanceiro={handleSaveFinanceiro}
                    onRemovePedido={handleRemovePedido}
                    onDeletePacote={handleDeletePacote}
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

      {/* ── Sharing stepper modal ── */}
      {sharing && (() => {
        const item = sharing.items[sharing.index];
        const isLast = sharing.index === sharing.items.length - 1;
        const tipoEn = TIPO_ENGLISH[item.tipo] || item.tipo;
        const version = item.feminino && item.genero === "Feminino" ? `${tipoEn} WOMENS` : `${tipoEn}`;
        const sizeForSupplier = TAMANHO_FORNECEDOR[item.tamanho] || item.tamanho;
        const img = getProductImage(item.yupooUrl, item.feminino && item.genero === "Feminino");
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSharing(null)}>
            <div className="bg-card-bg rounded-xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
              <div className="text-center mb-2">
                <span className="text-xs font-semibold text-text-muted">
                  Camisa {sharing.index + 1} de {sharing.items.length}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4">
                <div
                  className="bg-accent h-1.5 rounded-full transition-all"
                  style={{ width: `${((sharing.index + 1) / sharing.items.length) * 100}%` }}
                />
              </div>

              {/* Item card */}
              <div className="flex gap-3 mb-4">
                {img && (
                  <img src={img} alt={item.nome} width={80} height={80} className="w-20 h-20 object-cover rounded flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm mb-1">{item.nome}</p>
                  <div className="text-xs text-text-muted space-y-0.5">
                    <p>Version: {version}</p>
                    <p>Size: {sizeForSupplier}</p>
                    {item.personalizado && (
                      <>
                        <p>Name: {item.nomePersonalizado}</p>
                        <p>Number: {item.numeroPersonalizado}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  className="w-full px-4 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent/90 transition-colors cursor-pointer"
                  onClick={() => shareItem(item)}
                >
                  {typeof navigator.share === "function" ? "📤 Compartilhar" : "📋 Copiar"}
                </button>
                <div className="flex gap-2">
                  <button
                    className="flex-1 px-4 py-2.5 bg-gray-200 text-text-main rounded-lg font-semibold hover:bg-gray-300 transition-colors cursor-pointer"
                    onClick={() => setSharing(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
                    onClick={() => {
                      if (isLast) {
                        sharing.onDone();
                      } else {
                        setSharing({ ...sharing, index: sharing.index + 1 });
                      }
                    }}
                  >
                    {isLast ? "✓ Finalizar" : "Próximo →"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Copied toast ── */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-semibold z-50 animate-toast-in">
          ✓ Mensagem copiada!
        </div>
      )}

      {mensagem && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-semibold z-50 animate-toast-in">
          ✓ {mensagem}
        </div>
      )}

      {/* Custos modal */}
      {custosPacote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4" onClick={() => setCustosPacote(null)}>
          <div className="bg-card-bg rounded-md p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-primary">💰 Custos do Pacote {custosPacote.id.slice(0, 8)}</h3>
              <button className="text-text-muted hover:text-primary cursor-pointer bg-transparent border-none text-xl" onClick={() => setCustosPacote(null)}>✕</button>
            </div>

            <CustosForm
              pacote={custosPacote}
              allOrders={allOrders}
              config={config}
              onSaveAll={handleSaveAllFinanceiro}
              onClose={() => setCustosPacote(null)}
            />

            <button className="mt-4 w-full py-2.5 text-sm font-semibold bg-primary text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setCustosPacote(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CustosForm({
  pacote,
  allOrders,
  config,
  onSaveAll,
  onClose,
}: {
  pacote: Pacote;
  allOrders: Order[];
  config: LojaConfig;
  onSaveAll: (pacote: Pacote, values: { custo: number | null; frete: number | null; taxa_importacao: number | null; dolar_rate?: number | null }) => void;
  onClose: () => void;
}) {
  const [localCusto, setLocalCusto] = useState(pacote.custo?.toString() ?? "");
  const [localFrete, setLocalFrete] = useState(pacote.frete?.toString() ?? "");
  const [localTaxa, setLocalTaxa] = useState(pacote.taxa_importacao?.toString() ?? "");
  const [localDolar, setLocalDolar] = useState(pacote.dolar_rate?.toString() ?? "");

  const orders = pacote.pedido_ids
    .map((id) => allOrders.find((o) => o.id === id))
    .filter((o): o is Order => !!o);

  // Per-item cost overrides: key = `${orderId}-${itemIndex}` -> USD value
  const [itemCosts, setItemCosts] = useState<Record<string, string>>({});

  function getItemKey(o: Order, i: number) { return `${o.id}-${i}`; }

  function getItemCost(o: Order, item: OrderItem, i: number): number {
    const override = itemCosts[getItemKey(o, i)];
    if (override !== undefined && override !== "") return parseFloat(override) || 0;
    const custoCat = config.custo_base[item.tipo] ?? 0;
    const custoPers = item.personalizado ? (config.personalizacao_custo[item.tipo] ?? 0) : 0;
    return custoCat + custoPers;
  }

  const custoCalculadoUSD = orders.reduce((sum, o) => {
    return sum + o.itens.reduce((s, item, i) => s + getItemCost(o, item, i), 0);
  }, 0);
  const dolarRate = parseFloat(localDolar) || 0;
  const custoCalculadoBRL = custoCalculadoUSD * dolarRate;

  async function save() {
    await onSaveAll(pacote, {
      custo: localCusto ? parseFloat(localCusto) : (custoCalculadoBRL > 0 ? custoCalculadoBRL : null),
      frete: localFrete ? parseFloat(localFrete) : null,
      taxa_importacao: localTaxa ? parseFloat(localTaxa) : null,
      dolar_rate: localDolar ? parseFloat(localDolar) : null,
    });
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-green-50 rounded-md border border-green-200">
        <label className="block text-xs font-semibold text-green-700 mb-1">Cotação do dólar (R$)</label>
        <input
          type="number" step="0.01" min="0"
          value={localDolar}
          onChange={(e) => setLocalDolar(e.target.value)}
          placeholder="Ex: 5.20"
          className="w-full max-w-[200px] px-3 py-2 text-sm border border-green-300 rounded-md bg-white"
        />
        <p className="text-xs text-green-600 mt-1">
          Custo calculado: <strong>${custoCalculadoUSD.toFixed(2)} USD</strong>
          {dolarRate > 0 && <> → <strong>R$ {custoCalculadoBRL.toFixed(2)}</strong></>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-base">
              <th className="text-left px-2 py-1.5">Item</th>
              <th className="text-right px-2 py-1.5">Custo USD</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) =>
              o.itens.map((item, i) => {
                const key = getItemKey(o, i);
                const val = itemCosts[key] ?? "";
                const defaultCost = (config.custo_base[item.tipo] ?? 0) + (item.personalizado ? (config.personalizacao_custo[item.tipo] ?? 0) : 0);
                return (
                  <tr key={key} className="border-b border-border">
                    <td className="px-2 py-1.5">
                      <span className="font-medium">{item.nome}</span>
                      <span className="text-text-muted ml-1">({item.tamanho})</span>
                      {item.personalizado && <span className="text-accent ml-1">✦</span>}
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={val}
                        onChange={(e) => setItemCosts((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={defaultCost.toFixed(2)}
                        className="w-20 px-2 py-1 text-sm text-right border border-border rounded-md bg-card-bg"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className="px-2 py-1.5">Total</td>
              <td className="text-right px-2 py-1.5">${custoCalculadoUSD.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Custo total (R$)</label>
          <input type="number" step="0.01" value={localCusto} onChange={(e) => setLocalCusto(e.target.value)} onBlur={save}
            placeholder={custoCalculadoBRL > 0 ? custoCalculadoBRL.toFixed(2) : "0.00"}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg" />
          {custoCalculadoBRL > 0 && !localCusto && <p className="text-[10px] text-green-600 mt-0.5">Auto: R$ {custoCalculadoBRL.toFixed(2)}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Frete (R$)</label>
          <input type="number" step="0.01" value={localFrete} onChange={(e) => setLocalFrete(e.target.value)} onBlur={save}
            placeholder="0.00" className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Taxa de importação (R$)</label>
          <input type="number" step="0.01" value={localTaxa} onChange={(e) => setLocalTaxa(e.target.value)} onBlur={save}
            placeholder="0.00" className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg" />
        </div>
      </div>

      <button
        className="w-full py-2.5 text-sm font-semibold bg-green-600 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity"
        onClick={save}
      >
        Salvar Custos
      </button>
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
      const rate = getMPFeeRate(o.payment_method, o.credit_release_period || "immediate");
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
  config,
  onSaveFinanceiro,
  onRemovePedido,
  onDeletePacote,
}: {
  pacote: Pacote;
  allOrders: Order[];
  config: LojaConfig;
  onSaveFinanceiro: (pacote: Pacote, field: "custo" | "frete" | "taxa_importacao", value: string) => void;
  onRemovePedido: (pacoteId: string, pedidoId: string) => void;
  onDeletePacote: (pacoteId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localCusto, setLocalCusto] = useState(pacote.custo?.toString() ?? "");
  const [localFrete, setLocalFrete] = useState(pacote.frete?.toString() ?? "");
  const [localTaxa, setLocalTaxa] = useState(pacote.taxa_importacao?.toString() ?? "");
  const [localDolar, setLocalDolar] = useState("");
  const [creditReleasePeriod, setCreditReleasePeriod] = useState<"immediate" | "14_days" | "30_days">("immediate");

  const orders = pacote.pedido_ids
    .map((id) => allOrders.find((o) => o.id === id))
    .filter((o): o is Order => !!o);

  const nonAdminOrders = orders.filter((o) => !o.admin_order);
  const totalVendido = nonAdminOrders.reduce((sum, o) => sum + o.total, 0);
  const totalCamisas = orders.reduce((sum, o) => sum + o.itens.length, 0);
  const totalCamisasVendidas = nonAdminOrders.reduce((sum, o) => sum + o.itens.length, 0);

  // Auto-calculate custo from categories
  const custoCalculadoUSD = orders.reduce((sum, o) => {
    return sum + o.itens.reduce((s, item) => {
      const custoCat = config.custo_base[item.tipo] ?? 0;
      const custoPers = item.personalizado ? (config.personalizacao_custo[item.tipo] ?? 0) : 0;
      return s + custoCat + custoPers;
    }, 0);
  }, 0);
  const dolarRate = parseFloat(localDolar) || 0;
  const custoCalculadoBRL = custoCalculadoUSD * dolarRate;
  const custoValue = localCusto ? (parseFloat(localCusto) || 0) : custoCalculadoBRL;
  const freteValue = parseFloat(localFrete) || 0;
  const taxaValue = parseFloat(localTaxa) || 0;

  const hasCreditCard = orders.some((o) => o.payment_method === "credit_card");

  const totalTaxas = nonAdminOrders.reduce((sum, o) => {
    const rate = getMPFeeRate(o.payment_method, o.credit_release_period || creditReleasePeriod);
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
            <button
              className="text-text-muted hover:text-red-500 transition-colors cursor-pointer text-sm"
              onClick={(e) => { e.stopPropagation(); onDeletePacote(pacote.id); }}
              title="Excluir pacote do histórico"
            >
              ✕
            </button>
            <span className="text-text-muted text-sm">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          {/* Financial inputs */}
          <div className="mt-4 mb-4 p-3 bg-green-50 rounded-md border border-green-200">
            <h4 className="text-sm font-semibold text-green-800 mb-3">💰 Dados Financeiros</h4>

            {/* Dólar rate + auto-calc hint */}
            <div className="mb-3 p-2 bg-white rounded border border-green-200">
              <div className="flex items-center gap-3 mb-1">
                <label className="text-xs text-green-700 font-medium">Cotação do dólar (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={localDolar}
                  onChange={(e) => setLocalDolar(e.target.value)}
                  placeholder="Ex: 5.20"
                  className="w-28 px-2 py-1 text-sm border border-green-300 rounded-md bg-white"
                />
              </div>
              <p className="text-[11px] text-green-600">
                Custo calculado: <strong>${custoCalculadoUSD.toFixed(2)} USD</strong>
                {dolarRate > 0 && <> → <strong>R$ {custoCalculadoBRL.toFixed(2)}</strong></>}
                {dolarRate > 0 && !localCusto && <span className="ml-1">(preenchido automaticamente)</span>}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <label className="block text-xs text-green-700 mb-1">Custo do pacote (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={localCusto}
                  onChange={(e) => setLocalCusto(e.target.value)}
                  onBlur={() => onSaveFinanceiro(pacote, "custo", localCusto)}
                  placeholder={custoCalculadoBRL > 0 ? custoCalculadoBRL.toFixed(2) : "0.00"}
                  className="w-full px-3 py-2 border border-green-300 rounded-md bg-white text-sm"
                />
                {custoCalculadoBRL > 0 && !localCusto && (
                  <p className="text-[10px] text-green-500 mt-0.5">Auto: R$ {custoCalculadoBRL.toFixed(2)}</p>
                )}
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

            {/* Credit card release period per package — only if there are credit card orders */}
            {hasCreditCard && (
              <div className="mt-3 pt-3 border-t border-green-200">
                <label className="block text-xs text-green-700 mb-1">Prazo de liberação (Cartão de Crédito)</label>
                <select
                  className="w-full px-3 py-2 border border-green-300 rounded-md bg-white text-sm"
                  value={creditReleasePeriod}
                  onChange={(e) => setCreditReleasePeriod(e.target.value as "immediate" | "14_days" | "30_days")}
                >
                  <option value="immediate">Na hora — 4,99%</option>
                  <option value="14_days">Em 14 dias — 4,49%</option>
                  <option value="30_days">Em 30 dias — 3,99%</option>
                </select>
              </div>
            )}

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
              {hasCreditCard && (
                <div className="flex justify-between text-xs text-green-600">
                  <span className="pl-3">└ Cartão de crédito ({creditReleasePeriod === "immediate" ? "4,99%" : creditReleasePeriod === "14_days" ? "4,49%" : "3,99%"}):</span>
                  <span>{formatarMoeda(nonAdminOrders.filter(o => o.payment_method === "credit_card").reduce((sum, o) => sum + o.total * getMPFeeRate(o.payment_method, o.credit_release_period || creditReleasePeriod), 0))}</span>
                </div>
              )}
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
                        {PAYMENT_LABELS_SHORT[order.payment_method] || order.payment_method}
                      </span>
                    )}
                    {order.admin_order && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">👤</span>
                    )}
                    {order.pronta_entrega && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-800">📦</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{formatarMoeda(order.total)}</span>
                    <button
                      className="text-text-muted hover:text-red-500 transition-colors cursor-pointer text-xs"
                      onClick={() => onRemovePedido(pacote.id, order.id)}
                      title="Remover pedido do pacote"
                    >
                      ✕
                    </button>
                  </div>
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
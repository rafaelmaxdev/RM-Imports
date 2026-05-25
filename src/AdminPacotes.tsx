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

type Step = "select" | "review";

export default function AdminPacotes() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [custoPorCamisa, setCustoPorCamisa] = useState("");
  const [taxaEnvio, setTaxaEnvio] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const all = await getPedidos();
      setOrders(all.filter((o) => o.status === "pago"));
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

      setOrders((prev) => prev.filter((o) => !selectedIds.has(o.id)));
      setSelectedIds(new Set());
      setStep("select");
    } catch (err) {
      console.error("Erro ao enviar pacote:", err);
      alert("Erro ao atualizar status dos pedidos. Verifique manualmente.");
    } finally {
      setSending(false);
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
                           {item.temporada && <span>Patch: {item.temporada}</span>}
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

        {/* Financial Summary */}
        {(() => {
          const nonAdminOrders = selectedOrders.filter(o => !o.admin_order);
          const totalVendido = nonAdminOrders.reduce((sum, o) => sum + o.total, 0);
          const totalCamisasVendidas = nonAdminOrders.reduce((sum, o) => sum + o.itens.length, 0);
          const custoTotalCamisas = totalCamisasVendidas * (parseFloat(custoPorCamisa) || 0);
          const taxaEnvioValue = parseFloat(taxaEnvio) || 0;

          const FEE_RATES: Record<string, number> = {
            pix: 0.0199,
            credit_card: 0.0499,
            debit_card: 0.0399,
          };
          const totalTaxas = nonAdminOrders.reduce((sum, o) => {
            const rate = FEE_RATES[o.payment_method || ""] ?? 0.0499;
            return sum + o.total * rate;
          }, 0);

          const lucro = totalVendido - custoTotalCamisas - taxaEnvioValue - totalTaxas;

          return (
            <div className="bg-card-bg rounded-md p-4 shadow-card mb-4">
              <h4 className="text-sm font-semibold text-primary mb-3">📊 Resumo Financeiro</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Custo por camisa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={custoPorCamisa}
                    onChange={e => setCustoPorCamisa(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-border rounded-md bg-bg-base text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Taxa de envio (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={taxaEnvio}
                    onChange={e => setTaxaEnvio(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-border rounded-md bg-bg-base text-sm"
                  />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Camisas vendidas (excl. admin):</span>
                  <span>{totalCamisasVendidas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Custo total camisas:</span>
                  <span>{formatarMoeda(custoTotalCamisas)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Valor vendido (excl. admin):</span>
                  <span className="font-semibold">{formatarMoeda(totalVendido)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Taxas de pagamento:</span>
                  <span>{formatarMoeda(totalTaxas)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Taxa de envio:</span>
                  <span>{formatarMoeda(taxaEnvioValue)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                  <span>Lucro:</span>
                  <span className={lucro >= 0 ? "text-green-600" : "text-red-500"}>{formatarMoeda(lucro)}</span>
                </div>
              </div>
            </div>
          );
        })()}

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

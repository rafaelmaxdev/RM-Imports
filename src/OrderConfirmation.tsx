import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getPedidoById } from "./lib/db";
import type { Order } from "./types";
import { formatarMoeda } from "./types";
import { Wallet } from "@mercadopago/sdk-react";
import { STATUS_CONFIG, PAYMENT_LABELS } from "./lib/status";

export default function OrderConfirmation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [creatingPreference, setCreatingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if redirected from MP with success status
  const mpStatus = searchParams.get("status");
  const mpCollectionStatus = searchParams.get("collection_status");

  const needsPayment = !!(order?.status === "pendente" && order?.payment_method && !confirmed);

  // Only show Wallet if we actually have a preference ID
  const showWallet = needsPayment && !!order?.mp_preference_id;

  // Construct direct payment URL from preference ID
  const mpInitPoint = order?.mp_preference_id
    ? `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${order.mp_preference_id}`
    : null;

  // Create a new MP preference on demand (fixes "recarregue a página" loop when preference creation failed)
  const createPreferenceIfNeeded = useCallback(async () => {
    if (!order || order.mp_preference_id || creatingPreference) return;
    setCreatingPreference(true);
    setPreferenceError(null);
    try {
      const items = order.itens.map((item) => ({
        title: `${item.nome} (${item.tipo} - ${item.tamanho})`,
        quantity: 1,
        unit_price: item.preco,
      }));
      const res = await fetch("/api/create-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          orderId: order.id,
          paymentMethod: order.payment_method,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar preferência de pagamento");
      }
      const data = await res.json();
      // Update order with new preference ID
      setOrder((prev) => prev ? { ...prev, mp_preference_id: data.preferenceId } : prev);
    } catch (err: any) {
      console.error("Error creating preference on demand:", err);
      setPreferenceError(err.message || "Não foi possível gerar o link de pagamento.");
    } finally {
      setCreatingPreference(false);
    }
  }, [order, creatingPreference]);

  // Check if order is expired (pending for more than 24 hours)
  const isExpired = useMemo(() => {
    if (!order || order.status !== "pendente") return false;
    try {
      // Parse "dd/mm/yyyy HH:MM" format
      const [day, month, year] = order.data.split("/").map(Number);
      const [hours, minutes] = order.hora.split(":").map(Number);
      const orderDate = new Date(year, month - 1, day, hours, minutes);
      const now = new Date();
      const diffMs = now.getTime() - orderDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      return diffHours > 24;
    } catch {
      return false;
    }
  }, [order]);

  // Stable callbacks for Wallet brick — prevents infinite re-renders
  const handleWalletReady = useCallback(() => {
    setWalletReady(true);
  }, []);

  const handleWalletError = useCallback((err: { message?: string; error?: string }) => {
    console.warn("Wallet brick error:", err);
    setWalletError(err.message || err.error || "Erro ao carregar o pagamento");
  }, []);

  const walletInitialization = useMemo(() => ({
    preferenceId: order?.mp_preference_id ?? "",
  }), [order?.mp_preference_id]);

  useEffect(() => {
    if (!id) return;
    getPedidoById(id)
      .then((o) => {
        setOrder(o);
        // If MP redirected with approved status, or order already paid
        if (["pago", "enviado_fornecedor", "em_producao", "a_caminho", "em_estoque", "em_entrega", "entregue"].includes(o?.status || "") || mpStatus === "approved" || mpCollectionStatus === "approved") {
          setConfirmed(true);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-create MP preference if missing (fixes "recarregue a página" loop)
  useEffect(() => {
    if (!order || order.mp_preference_id || creatingPreference || order.status !== "pendente" || !order.payment_method) return;
    createPreferenceIfNeeded();
  }, [order?.id, order?.mp_preference_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for status updates when order is pending
  // Stop polling when Wallet is mounted and ready (prevents Wallet remount loop)
  useEffect(() => {
    if (!id || confirmed || walletReady) return;

    pollingRef.current = setInterval(async () => {
      try {
        const o = await getPedidoById(id);
        if (o) {
          setOrder(o);
          if (["pago", "enviado_fornecedor", "em_producao", "a_caminho", "em_estoque", "em_entrega", "entregue"].includes(o.status)) {
            setConfirmed(true);
          } else if (o.status === "cancelado" || o.status === "reembolsado") {
            setConfirmed(false);
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [id, confirmed, walletReady]);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="w-15 h-15 bg-gray-200 rounded-full mx-auto" />
          <div className="h-6 bg-gray-200 rounded w-2/3 mx-auto" />
          <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
          <div className="bg-gray-200 rounded-md p-6 space-y-4">
            <div className="h-4 bg-gray-300 rounded w-1/3" />
            <div className="h-4 bg-gray-300 rounded w-2/3" />
            <div className="h-4 bg-gray-300 rounded w-1/2" />
          </div>
          <div className="h-12 bg-gray-200 rounded-md" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <h2 className="text-xl text-primary mb-4">Pedido não encontrado</h2>
        <button
          className="px-6 py-3 text-base font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
          onClick={() => navigate("/")}
        >
          Voltar à loja
        </button>
      </div>
    );
  }

  const paymentLabel = order.payment_method ? PAYMENT_LABELS[order.payment_method] || order.payment_method : "";
  const statusInfo = STATUS_CONFIG[order.status] || STATUS_CONFIG.pendente;

  // ── Payment confirmed screen ──
  if (confirmed || ["pago", "enviado_fornecedor", "em_producao", "a_caminho", "em_estoque", "em_entrega", "entregue"].includes(order.status)) {
    const econTotal = order.itens.reduce((sum, item) => sum + ((item.precoBase ?? item.preco) - item.preco), 0);
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Success header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center text-3xl mx-auto mb-3 animate-bounce shadow-lg shadow-green-200" aria-hidden="true">✓</div>
          <h2 className="text-xl font-bold text-primary">Pedido Confirmado!</h2>
          <p className="text-sm text-text-muted mt-1">Seu pedido foi registrado com sucesso.</p>
        </div>

        {/* Order info card */}
        <div className="bg-card-bg rounded-lg border border-border overflow-hidden mb-4">
          <div className="p-4 bg-accent/5 border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-bold text-primary break-all">{order.id}</span>
                <span className="ml-2 text-xs text-text-muted whitespace-nowrap">{order.data}</span>
              </div>
              <span className={`shrink-0 inline-block px-2 py-1 rounded text-[10px] font-semibold whitespace-nowrap ${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</span>
            </div>
          </div>

          {/* Items */}
          <div className="p-4 border-b border-border">
            <h4 className="text-xs font-semibold text-text-muted mb-3 uppercase tracking-wide">Itens</h4>
            <div className="flex flex-col gap-2">
              {order.itens.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="font-medium text-sm">{item.nome}</div>
                    <div className="text-xs text-text-muted mt-0.5">{item.tipo} &middot; {item.tamanho} &middot; {item.genero}</div>
                    {item.personalizado && <div className="text-xs text-accent mt-0.5">✦ Personalizado</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-sm text-accent">{formatarMoeda(item.preco)}</div>
                    {item.precoBase != null && item.precoBase > item.preco && (
                      <div className="text-[10px] text-text-muted line-through">{formatarMoeda(item.precoBase)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total & savings */}
          <div className="p-4 border-b border-border">
            <div className="flex justify-between items-center">
              <span className="font-bold text-base">Total</span>
              <span className="font-bold text-lg text-accent">{formatarMoeda(order.total)}</span>
            </div>
            {econTotal > 0 && <div className="flex justify-between text-xs text-green-600 mt-1"><span>Economia</span><span>-{formatarMoeda(econTotal)}</span></div>}
            {paymentLabel && <div className="flex justify-between text-xs text-text-muted mt-1"><span>Pagamento</span><span>{paymentLabel}</span></div>}
            {order.mp_payment_id && <div className="flex justify-between text-xs text-text-muted mt-1"><span>ID Transação</span><span className="font-mono">{order.mp_payment_id}</span></div>}
          </div>

          {/* Delivery info */}
          {order.endereco && (
            <div className="p-4">
              {order.endereco.deliveryMethod === "retirada" ? (
                <div className="text-xs text-text-muted leading-relaxed">
                  <span className="font-medium text-text-main block mb-1">📍 Retirada em Caruaru</span>
                  <span>{order.endereco.nome} &middot; {order.endereco.telefone}</span>
                </div>
              ) : order.endereco.deliveryMethod === "venda_direta" ? (
                <div className="text-xs text-text-muted leading-relaxed">
                  <span className="font-medium text-green-600 block mb-1">✅ Venda direta (boca a boca)</span>
                  <span>{order.endereco.nome}</span>
                </div>
              ) : (
                <div className="text-xs text-text-muted leading-relaxed">
                  <span className="font-medium text-text-main block mb-1">🚚 Entrega em Bezerros</span>
                  <span>{order.endereco.nome}</span>
                  <span className="block">{order.endereco.rua}, {order.endereco.numero}</span>
                  <span className="block">{order.endereco.bairro} &middot; {order.endereco.cidade}/{order.endereco.estado}</span>
                  <span className="block">Tel: {order.endereco.telefone}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Next steps */}
        <div className="bg-card-bg rounded-lg border border-border p-4 mb-4">
          <h4 className="text-sm font-semibold text-primary mb-2">📋 Próximos passos</h4>
          <ol className="text-xs text-text-muted space-y-1.5 list-decimal list-inside">
            {order.pronta_entrega ? (
              <>
                <li>Seu pedido está sendo preparado para entrega</li>
                <li>Acompanhe o status pelo <button className="text-accent underline bg-transparent border-none cursor-pointer p-0 inline text-xs" onClick={() => navigate("/meu-pedido")}>Meu Pedido</button></li>
                <li>Assim que sair para entrega, avisaremos</li>
              </>
            ) : (
              <>
                <li>Seu pedido será enviado para produção</li>
                <li>Acompanhe o status pelo <button className="text-accent underline bg-transparent border-none cursor-pointer p-0 inline text-xs" onClick={() => navigate("/meu-pedido")}>Meu Pedido</button></li>
                <li>Assim que chegar, avisaremos para retirada/entrega</li>
              </>
            )}
          </ol>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button className="w-full py-3 bg-accent text-white rounded-md font-semibold cursor-pointer transition-opacity hover:opacity-90 text-sm" onClick={() => navigate("/")}>← Continuar Comprando</button>
          <a href={`https://wa.me/${import.meta.env.VITE_WHATSAPP_SUPPORT || "5511999999999"}?text=${encodeURIComponent("Tenho uma dúvida sobre meu pedido " + order.id)}`} target="_blank" rel="noreferrer" className="block w-full py-3 bg-green-600 text-white rounded-md text-sm font-semibold text-center no-underline hover:opacity-90 transition-opacity">📱 Fale Conosco</a>
          <button className="w-full py-3 border border-border bg-card-bg text-text-main rounded-md font-semibold cursor-pointer transition-colors hover:border-accent text-sm" onClick={() => navigate("/meu-pedido")}>🔍 Acompanhar Pedido</button>
        </div>
      </div>
    );
  }

  // ── Cancelled order ──
  if (order.status === "cancelado") {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <div className="w-20 h-20 bg-red-500 text-white rounded-full flex items-center justify-center text-4xl mx-auto mb-4">
          ✕
        </div>
        <h2 className="text-2xl text-primary mb-2">Pagamento Recusado</h2>
        <p className="text-text-muted mb-6">
          O pagamento do pedido <strong>{order.id}</strong> não foi aprovado.
        </p>
        <button
          className="px-6 py-3 text-base font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
          onClick={() => navigate("/")}
        >
          Voltar à Loja
        </button>
      </div>
    );
  }

  // ── Pending payment ──
  return (
    <div className="max-w-lg mx-auto px-4 py-8 text-center min-h-[600px]">
      <div className="mb-8">
        <div className="w-15 h-15 bg-yellow-500 text-white rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          ⏳
        </div>
        <h2 className="text-xl text-primary mb-2">Finalize o Pagamento</h2>
        <p>
          Pedido <strong>{order.id}</strong> —{" "}
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusInfo.bg} ${statusInfo.text}`}>
            {statusInfo.label}
          </span>
        </p>
      </div>

      {!order && !loading && (
        <div className="text-center py-8 text-text-muted">Pedido não encontrado.</div>
      )}
      {order && (
      <div className="bg-card-bg rounded-md p-6 text-left shadow-card mb-6">
        <h3 className="text-primary mb-4">Detalhes do Pedido</h3>
        <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-border">
          <div className="flex justify-between">
            <span className="text-text-muted">Data</span>
            <span className="font-medium">{order.data} às {order.hora}</span>
          </div>
          {paymentLabel && (
            <div className="flex justify-between">
              <span className="text-text-muted">Pagamento</span>
              <span className="font-medium">{paymentLabel}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-muted">Itens</span>
            <span className="font-medium">{order.itens.length} {order.itens.length === 1 ? "item" : "itens"}</span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {order.itens.map((item, i) => (
            <div key={i} className="pb-4 border-b border-border last:border-b-0">
              <div className="font-semibold mb-1">{item.nome}</div>
              <div className="flex flex-wrap gap-3 text-sm text-text-muted">
                <span className="px-1.5 py-0.5 bg-primary/10 rounded text-xs">{item.tipo}</span>
                <span>Tamanho: {item.tamanho}</span>
                <span>Modelo: {item.genero}</span>
                {item.temporada && <span>Temporada: {item.temporada}</span>}
              </div>
              {item.personalizado && (
                <div className="text-xs text-accent font-semibold mt-1">
                  ✦ Personalizado: {item.nomePersonalizado} #{item.numeroPersonalizado}
                </div>
              )}
              {item.precoBase != null && item.precoBase > item.preco ? (
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-text-muted text-sm line-through">{formatarMoeda(item.precoBase)}</span>
                  <span className="font-bold text-accent">{formatarMoeda(item.preco)}</span>
                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{Math.round(((item.precoBase - item.preco) / item.precoBase) * 100)}% OFF</span>
                </div>
              ) : (
                <div className="font-bold text-accent mt-1">{formatarMoeda(item.preco)}</div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between font-bold text-xl mt-4 pt-4 border-t-2 border-primary">
          <span>Total:</span>
          <span>{formatarMoeda(order.total)}</span>
        </div>
        {order.itens.some((item) => item.precoBase != null && item.precoBase > item.preco) && (
          <div className="flex justify-between text-sm text-green-600 font-semibold mt-1">
            <span>Economia:</span>
            <span>{formatarMoeda(order.itens.reduce((sum, item) => sum + ((item.precoBase ?? item.preco) - item.preco), 0))}</span>
          </div>
        )}

        {order.endereco && (
          <div className="mt-6 pt-4 border-t border-border">
            {order.endereco.deliveryMethod === "retirada" ? (
              <>
                <h3 className="text-base mb-2 text-primary">📍 Retirada na Magazine Luiza</h3>
                <div className="text-sm text-text-muted leading-relaxed">
                  <div className="font-semibold text-text-main">{order.endereco.nome}</div>
                  <div>Tel: {order.endereco.telefone}</div>
                </div>
                <div className="mt-3 p-3 bg-blue-50 rounded-md border border-blue-200">
                  <p className="text-xs text-blue-800 font-semibold">📍 Retirada na Magazine Luiza — Centro de Caruaru</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Avisaremos quando o pedido estiver disponível para retirada. Dirija-se à Magazine Luiza no Centro de Caruaru para buscar seu pedido.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base mb-2 text-primary">Endereço de Entrega</h3>
                <div className="text-sm text-text-muted leading-relaxed">
                  <div className="font-semibold text-text-main">{order.endereco.nome}</div>
                  <div>
                    {order.endereco.rua}, {order.endereco.numero}
                    {order.endereco.complemento ? ` - ${order.endereco.complemento}` : ""}
                  </div>
                  <div>
                    {order.endereco.bairro} - {order.endereco.cidade}/{order.endereco.estado}
                  </div>
                  <div>CEP: {order.endereco.cep}</div>
                  <div>Tel: {order.endereco.telefone}</div>
                </div>
                <div className="mt-3 p-3 bg-green-50 rounded-md border border-green-200">
                  <p className="text-xs text-green-800 font-semibold">🎉 Frete grátis — Entrega em Bezerros</p>
                  <p className="text-xs text-green-700 mt-1">
                    Entrega gratuita para Bezerros-PE. Entraremos em contato para agendar a entrega.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      )}

      {/* Mercado Pago Payment Section */}
      {needsPayment && !isExpired && (
        <div className="bg-card-bg rounded-md p-6 shadow-card mb-6">
          <h3 className="text-primary mb-2">Pagar com {paymentLabel}</h3>
          <p className="text-sm text-text-muted mb-4">
            Clique no botão abaixo para finalizar o pagamento via Mercado Pago.
            A confirmação é automática após o pagamento.
          </p>

          {showWallet ? (
            !walletError ? (
              <div className="flex justify-center min-h-[48px]">
                {!walletReady && (
                  <div className="h-12 w-48 bg-gray-200 animate-pulse rounded-lg" />
                )}
                <Wallet
                  initialization={walletInitialization}
                  onReady={handleWalletReady}
                  onError={handleWalletError}
                />
              </div>
            ) : (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-center">
                <p className="text-sm text-red-800 font-semibold">Não foi possível carregar o botão de pagamento</p>
                <p className="text-xs text-red-700 mt-1">{walletError}</p>
                {mpInitPoint && (
                  <a
                    href={mpInitPoint}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 px-6 py-3 text-base font-semibold bg-[#009EE3] text-white rounded-md transition-opacity hover:opacity-90 no-underline"
                  >
                    Pagar com {paymentLabel}
                  </a>
                )}
                <button
                  className="mt-3 px-4 py-2 text-sm font-semibold bg-border text-text-main rounded-md cursor-pointer transition-opacity hover:opacity-90 ml-2"
                  onClick={() => { setWalletError(null); setWalletReady(false); }}
                >
                  Tentar novamente
                </button>
              </div>
            )
          ) : (
            /* No preference ID yet — try to create one on demand */
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-center">
              {creatingPreference ? (
                <>
                  <p className="text-sm text-yellow-800 font-semibold">Gerando link de pagamento...</p>
                  <div className="mt-3 h-8 w-48 bg-yellow-200 animate-pulse rounded-lg mx-auto" />
                </>
              ) : preferenceError ? (
                <>
                  <p className="text-sm text-red-800 font-semibold">Erro ao gerar link de pagamento</p>
                  <p className="text-xs text-red-700 mt-1">{preferenceError}</p>
                  <button
                    className="mt-3 px-4 py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
                    onClick={createPreferenceIfNeeded}
                  >
                    Tentar novamente
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-yellow-800 font-semibold">Preparando pagamento</p>
                  <p className="text-xs text-yellow-700 mt-1">
                    O link de pagamento está sendo gerado. Aguarde um momento...
                  </p>
                  <button
                    className="mt-3 px-4 py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
                    onClick={createPreferenceIfNeeded}
                  >
                    Gerar link de pagamento
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expired order notice */}
      {needsPayment && isExpired && (
        <div className="bg-red-50 rounded-md p-6 shadow-card mb-6 border border-red-200">
          <h3 className="text-red-800 mb-2">⏰ Pagamento expirado</h3>
          <p className="text-sm text-red-700 mb-4">
            O prazo de 24 horas para pagamento deste pedido expirou. Por favor, crie um novo pedido.
          </p>
          <button
            className="px-6 py-3 text-base font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
            onClick={() => navigate("/")}
          >
            Voltar à Loja
          </button>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Aguardando confirmação do pagamento... Esta página será atualizada automaticamente.
      </p>

      {needsPayment && !isExpired && (
        <div className="mt-4 p-3 bg-yellow-50 rounded-md border border-yellow-200">
          <p className="text-xs text-yellow-800 font-semibold">⏰ Você tem 24 horas para pagar</p>
          <p className="text-xs text-yellow-700 mt-0.5">
            Após esse prazo, o pedido será cancelado automaticamente.
          </p>
        </div>
      )}

      <div className="flex flex-col items-center gap-3 mt-4">
        <button
          className="px-6 py-3 text-base font-semibold bg-border text-text-main rounded-md cursor-pointer transition-colors hover:bg-gray-300"
          onClick={() => navigate("/")}
        >
          Voltar à Loja
        </button>
      </div>
    </div>
  );
}
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getPedidoById } from "./lib/db";
import type { Order } from "./types";
import { formatarMoeda } from "./types";
import { Wallet } from "@mercadopago/sdk-react";
import { STATUS_CONFIG, PAYMENT_LABELS } from "./lib/status";

/** Detect Instagram/Facebook in-app browser */
function isInAppBrowser(): boolean {
  if (typeof window !== "undefined" && (window as any).__inAppBrowser) return true;
  const ua = navigator.userAgent || "";
  return /Instagram/i.test(ua) || /FBAN|FBAV/i.test(ua);
}

export default function OrderConfirmation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [inAppBrowser] = useState(isInAppBrowser);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if redirected from MP with success status
  const mpStatus = searchParams.get("status");
  const mpCollectionStatus = searchParams.get("collection_status");

  const needsPayment = !!(order?.status === "pendente" && order?.payment_method && !confirmed);

  // Only show Wallet if we actually have a preference ID
  const showWallet = needsPayment && !!order?.mp_preference_id;

  // Construct direct payment URL from preference ID (avoids storing redundant data in DB)
  const mpInitPoint = order?.mp_preference_id
    ? `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${order.mp_preference_id}`
    : null;

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
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        {/* Success animation */}
        <div className="mb-6">
          <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center text-4xl mx-auto mb-4 animate-bounce" aria-hidden="true">
            ✓
          </div>
          <h2 className="text-2xl text-primary mb-2">{statusInfo.icon} {statusInfo.label}!</h2>
          <p className="text-text-muted">
            Pedido <strong>{order.id}</strong>
          </p>
          <span className={`inline-block px-3 py-1 rounded text-sm font-semibold ${statusInfo.bg} ${statusInfo.text} mt-2`}>
            {statusInfo.label}
          </span>
        </div>

        {/* Order summary */}
        <div className="bg-card-bg rounded-md p-6 text-left shadow-card mb-6">
          <h3 className="text-primary mb-4">Resumo do Pedido</h3>
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
            {order.mp_payment_id && (
              <div className="flex justify-between">
                <span className="text-text-muted">ID da Transação</span>
                <span className="font-medium text-xs">{order.mp_payment_id}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {order.itens.map((item, i) => (
              <div key={i} className="pb-4 border-b border-border last:border-b-0">
                <div className="font-semibold mb-1">{item.nome}</div>
                <div className="flex flex-wrap gap-3 text-sm text-text-muted">
                  <span className="px-1.5 py-0.5 bg-primary/10 rounded text-xs">{item.tipo}</span>
                  <span>Tamanho: {item.tamanho}</span>
                  <span>Modelo: {item.genero}</span>
                </div>
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

        <div className="bg-green-50 rounded-md p-4 mb-6 border border-green-200">
          <p className="text-sm text-green-800 font-semibold">{statusInfo.icon} Pedido confirmado!</p>
          <p className="text-xs text-green-700 mt-1">
            {order.endereco?.deliveryMethod === "retirada"
              ? "Aguarde até a retirada. Avisaremos quando estiver disponível na Magazine Luiza em Caruaru."
              : "Aguarde a entrega. Avisaremos quando o pedido estiver a caminho."}
          </p>
        </div>

        {order.mp_payment_id && (
          <div className="bg-blue-50 rounded-md p-4 mb-6 border border-blue-200">
            <p className="text-sm text-blue-800 font-semibold">ID da Transação: {order.mp_payment_id}</p>
            <p className="text-xs text-blue-700 mt-1">
              O ID da transação também foi enviado para o seu email. Use-o para qualquer dúvida sobre o pedido.
            </p>
          </div>
        )}

        <button
          className="px-8 py-3 text-base font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
          onClick={() => navigate("/")}
        >
          Voltar à Loja
        </button>
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

      {/* Mercado Pago Payment Section */}
      {needsPayment && !isExpired && (
        <div className="bg-card-bg rounded-md p-6 shadow-card mb-6">
          <h3 className="text-primary mb-2">Pagar com {paymentLabel}</h3>
          <p className="text-sm text-text-muted mb-4">
            Clique no botão abaixo para finalizar o pagamento via Mercado Pago.
            A confirmação é automática após o pagamento.
          </p>

          {/* In-app browser warning */}
          {inAppBrowser && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-md mb-4 text-left">
              <p className="text-sm text-orange-800 font-semibold">⚠️ Navegador interno detectado</p>
              <p className="text-xs text-orange-700 mt-1">
                Para garantir que o pagamento funcione corretamente, abra esta página no navegador do seu celular (Chrome, Safari, etc).
              </p>
              <button
                className="mt-2 px-4 py-2 text-sm font-semibold bg-orange-600 text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
                onClick={() => {
                  const url = window.location.href;
                  // iOS: try opening in Safari
                  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                    window.location.href = url.replace(/^https?:\/\//, "x-safari-");
                  }
                  // Android: try opening in Chrome
                  else if (/Android/.test(navigator.userAgent)) {
                    window.location.href = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
                  }
                  // Fallback: copy link instruction
                  else {
                    navigator.clipboard?.writeText(url);
                    alert("Copie o link e abra no navegador do seu celular:\n\n" + url);
                  }
                }}
              >
                Abrir no navegador
              </button>
            </div>
          )}

          {showWallet && !inAppBrowser ? (
            walletError ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-center">
                <p className="text-sm text-red-800 font-semibold">Não foi possível carregar o botão de pagamento</p>
                <p className="text-xs text-red-700 mt-1">{walletError}</p>
                <p className="text-xs text-red-600 mt-2">
                  Desative extensões de bloqueio (ad blockers) e recarregue a página.
                </p>
                {/* Fallback: direct payment link */}
                {mpInitPoint && (
                  <a
                    href={mpInitPoint}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 px-6 py-3 text-base font-semibold bg-accent text-white rounded-md transition-opacity hover:opacity-90 no-underline"
                  >
                    Pagar via Mercado Pago
                  </a>
                )}
                <button
                  className="mt-3 px-4 py-2 text-sm font-semibold bg-border text-text-main rounded-md cursor-pointer transition-opacity hover:opacity-90 ml-2"
                  onClick={() => { setWalletError(null); setWalletReady(false); }}
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
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
            )
          ) : showWallet && inAppBrowser ? (
            /* In-app browser: show direct payment link instead of Wallet brick */
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-center">
              <p className="text-sm text-blue-800 font-semibold mb-2">Finalize o pagamento no Mercado Pago</p>
              <p className="text-xs text-blue-700 mb-3">
                Clique no botão abaixo para ser redirecionado ao pagamento.
              </p>
              {mpInitPoint ? (
                <a
                  href={mpInitPoint}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-6 py-3 text-base font-semibold bg-[#009EE3] text-white rounded-md transition-opacity hover:opacity-90 no-underline"
                >
                  Pagar com {paymentLabel}
                </a>
              ) : (
                <p className="text-xs text-yellow-700">
                  O link de pagamento ainda está sendo gerado. Aguarde um momento e recarregue a página.
                </p>
              )}
            </div>
          ) : (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-center">
              <p className="text-sm text-yellow-800 font-semibold">Pagamento pendente</p>
              <p className="text-xs text-yellow-700 mt-1">
                O link de pagamento ainda está sendo processado. Aguarde um momento e recarregue a página.
              </p>
              <button
                className="mt-3 px-4 py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
                onClick={() => window.location.reload()}
              >
                Recarregar página
              </button>
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
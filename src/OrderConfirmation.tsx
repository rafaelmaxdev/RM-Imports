import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getPedidoById } from "./lib/db";
import type { Order } from "./types";
import { formatarMoeda } from "./types";
import { Wallet } from "@mercadopago/sdk-react";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pendente: { label: "Aguardando pagamento", bg: "bg-yellow-100", text: "text-yellow-800" },
  pago: { label: "Pagamento confirmado", bg: "bg-green-100", text: "text-green-800" },
  entregue: { label: "Entregue", bg: "bg-cyan-100", text: "text-cyan-800" },
  cancelado: { label: "Cancelado", bg: "bg-red-100", text: "text-red-800" },
};

export default function OrderConfirmation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if redirected from MP with success status
  const mpStatus = searchParams.get("status");
  const mpCollectionStatus = searchParams.get("collection_status");

  useEffect(() => {
    if (!id) return;
    getPedidoById(id)
      .then((o) => {
        setOrder(o);
        // If MP redirected with approved status, or order already paid
        if (o?.status === "pago" || mpStatus === "approved" || mpCollectionStatus === "approved") {
          setConfirmed(true);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for status updates when order is pending
  useEffect(() => {
    if (!id || confirmed) return;

    pollingRef.current = setInterval(async () => {
      try {
        const o = await getPedidoById(id);
        if (o) {
          setOrder(o);
          if (o.status === "pago") {
            setConfirmed(true);
          } else if (o.status === "cancelado") {
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
  }, [id, confirmed]);

  // Auto-redirect countdown after confirmation
  useEffect(() => {
    if (!confirmed) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [confirmed, navigate]);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <div className="text-text-muted text-lg">Carregando pedido...</div>
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

  const isMPPayment = !!order.payment_method;
  const paymentLabel = order.payment_method ? PAYMENT_LABELS[order.payment_method] || order.payment_method : "";
  const statusInfo = STATUS_CONFIG[order.status] || STATUS_CONFIG.pendente;
  const needsPayment = order.status === "pendente" && isMPPayment && !!order.mp_preference_id;

  // ── Payment confirmed screen ──
  if (confirmed || order.status === "pago") {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        {/* Success animation */}
        <div className="mb-6">
          <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center text-4xl mx-auto mb-4 animate-bounce">
            ✓
          </div>
          <h2 className="text-2xl text-primary mb-2">Pagamento Confirmado!</h2>
          <p className="text-text-muted">
            Pedido <strong>{order.id}</strong>
          </p>
          <span className={`inline-block px-3 py-1 rounded text-sm font-semibold ${STATUS_CONFIG.pago.bg} ${STATUS_CONFIG.pago.text} mt-2`}>
            {STATUS_CONFIG.pago.label}
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
                <div className="font-bold text-accent mt-1">{formatarMoeda(item.preco)}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-between font-bold text-xl mt-4 pt-4 border-t-2 border-primary">
            <span>Total:</span>
            <span>{formatarMoeda(order.total)}</span>
          </div>

          {order.endereco && (
            <div className="mt-6 pt-4 border-t border-border">
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
            </div>
          )}
        </div>

        <div className="bg-green-50 rounded-md p-4 mb-6 border border-green-200">
          <p className="text-sm text-green-800 font-semibold">✓ Pagamento confirmado!</p>
          <p className="text-xs text-green-700 mt-1">
            Agora é só aguardar a entrega. Acompanhe o status do seu pedido nesta página.
          </p>
        </div>

        <button
          className="px-8 py-3 text-base font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
          onClick={() => navigate("/")}
        >
          Voltar à Loja {countdown > 0 && `(${countdown}s)`}
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
    <div className="max-w-lg mx-auto px-4 py-8 text-center">
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
              <div className="font-bold text-accent mt-1">{formatarMoeda(item.preco)}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-between font-bold text-xl mt-4 pt-4 border-t-2 border-primary">
          <span>Total:</span>
          <span>{formatarMoeda(order.total)}</span>
        </div>

        {order.endereco && (
          <div className="mt-6 pt-4 border-t border-border">
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
          </div>
        )}
      </div>

      {/* Mercado Pago Payment Section */}
      {needsPayment && (
        <div className="bg-card-bg rounded-md p-6 shadow-card mb-6">
          <h3 className="text-primary mb-2">Pagar com {paymentLabel}</h3>
          <p className="text-sm text-text-muted mb-4">
            Clique no botão abaixo para finalizar o pagamento via Mercado Pago.
            A confirmação é automática após o pagamento.
          </p>
          <div className="flex justify-center">
            <Wallet initialization={{ preferenceId: order.mp_preference_id! }} />
          </div>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Aguardando confirmação do pagamento... Esta página será atualizada automaticamente.
      </p>

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
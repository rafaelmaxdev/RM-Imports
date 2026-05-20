import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPedidoById } from "./lib/db";
import type { Order } from "./types";
import { montarMensagemPagamento, WHATSAPP_NUMBER, formatarMoeda } from "./types";

export default function OrderConfirmation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getPedidoById(id)
      .then((o) => setOrder(o))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

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

  const msg = montarMensagemPagamento(order);
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

  return (
    <div className="max-w-lg mx-auto px-4 py-8 text-center">
      <div className="mb-8">
        <div className="w-15 h-15 bg-green-500 text-white rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          ✓
        </div>
        <h2 className="text-primary mb-2">Pedido Confirmado!</h2>
        <p>
          Seu pedido <strong>{order.id}</strong> foi registrado com sucesso.
        </p>
      </div>

      <div className="bg-card-bg rounded-md p-6 text-left shadow-card mb-6">
        <h3 className="text-primary mb-4">Detalhes do Pedido</h3>
        <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-border">
          <div className="flex justify-between">
            <span className="text-text-muted">Data</span>
            <span className="font-medium">{order.data} às {order.hora}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Status</span>
            <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
              Aguardando pagamento
            </span>
          </div>
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

      <div className="flex flex-col items-center gap-3">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block bg-green-500 text-white px-6 py-3 rounded-md no-underline font-semibold transition-opacity hover:opacity-90"
        >
          Confirmar Pagamento via WhatsApp
        </a>

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
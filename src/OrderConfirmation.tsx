import { useParams, useNavigate } from "react-router-dom";
import { useCart } from "./CartContext";
import { montarMensagemPagamento, WHATSAPP_NUMBER, formatarMoeda } from "./types";

export default function OrderConfirmation() {
  const { id } = useParams<{ id: string }>();
  const { orders } = useCart();
  const navigate = useNavigate();

  const order = orders.find((o) => o.id === id);

  if (!order) {
    return (
      <div className="order-container">
        <h2>Pedido não encontrado</h2>
        <button className="btn btn-add" onClick={() => navigate("/")}>
          Voltar à loja
        </button>
      </div>
    );
  }

  const msg = montarMensagemPagamento(order);
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

  return (
    <div className="order-container">
      <div className="order-success">
        <div className="order-check-icon">✓</div>
        <h2>Pedido Confirmado!</h2>
        <p>Seu pedido <strong>{order.id}</strong> foi registrado com sucesso.</p>
      </div>

      <div className="order-details">
        <h3>Detalhes</h3>
        <div className="order-info">
          <div><strong>Data:</strong> {order.data} às {order.hora}</div>
          <div><strong>Status:</strong> Aguardando pagamento</div>
        </div>

        <div className="order-itens">
          {order.itens.map((item, i) => (
            <div key={i} className="order-item">
              <div className="order-item-nome">{item.nome}</div>
              <div className="order-item-detalhes">
                <span>Tamanho: {item.tamanho}</span>
                <span>Modelo: {item.genero}</span>
                <span>Tipo: {item.tipo}</span>
                {item.personalizado && (
                  <>
                    <span>Nome: {item.nomePersonalizado}</span>
                    <span>Número: {item.numeroPersonalizado}</span>
                  </>
                )}
              </div>
              <div className="order-item-preco">{formatarMoeda(item.preco)}</div>
            </div>
          ))}
        </div>

        <div className="order-total">
          <span>Total:</span>
          <span>{formatarMoeda(order.total)}</span>
        </div>

        {order.endereco && (
          <div className="order-address-section">
            <h3>Endereço de Entrega</h3>
            <div className="order-address-display">
              <div>{order.endereco.nome}</div>
              <div>{order.endereco.rua}, {order.endereco.numero}{order.endereco.complemento ? ` - ${order.endereco.complemento}` : ""}</div>
              <div>{order.endereco.bairro} - {order.endereco.cidade}/{order.endereco.estado}</div>
              <div>CEP: {order.endereco.cep}</div>
              <div>Tel: {order.endereco.telefone}</div>
            </div>
          </div>
        )}
      </div>

      <a href={whatsappUrl} target="_blank" rel="noreferrer" className="btn btn-whatsapp">
        Confirmar Pagamento via WhatsApp
      </a>

      <button className="btn btn-cancel" onClick={() => navigate("/")}>
        Voltar à Loja
      </button>
    </div>
  );
}

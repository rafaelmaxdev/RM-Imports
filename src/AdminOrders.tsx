import { useState } from "react";
import { useCart } from "./CartContext";
import { montarMensagemFornecedor, WHATSAPP_NUMBER, formatarMoeda } from "./types";

export default function AdminOrders() {
  const { orders, deleteOrder, updateOrderStatus, confirmDelivery } = useCart();
  const [search, setSearch] = useState("");

  const filteredOrders = orders.filter((order) => {
    const term = search.toLowerCase();
    if (!term) return true;
    if (order.id.toLowerCase().includes(term)) return true;
    if (order.endereco?.nome?.toLowerCase().includes(term)) return true;
    if (order.endereco?.telefone?.includes(term)) return true;
    return false;
  });

  return (
    <div className="admin-container">
      <div className="admin-header-row">
        <h2>Pedidos ({filteredOrders.length})</h2>
        <input
          type="text"
          placeholder="Buscar por ID, nome ou telefone..."
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredOrders.length === 0 ? (
        <p className="empty-msg">Nenhum pedido encontrado.</p>
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order) => {
            const msg = montarMensagemFornecedor(order);
            const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

            return (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <div>
                    <span className="order-id">{order.id}</span>
                    <span className={`order-status ${order.status}`}>
                      {order.status === "pendente" ? "Pendente" : "Confirmado"}
                    </span>
                  </div>
                  <div className="order-header-right">
                    <div className="order-date">{order.data} {order.hora}</div>
                    <button
                      className="btn-delete-order"
                      onClick={() => {
                        if (confirm(`Excluir pedido ${order.id}? Esta ação não pode ser desfeita.`)) {
                          deleteOrder(order.id);
                        }
                      }}
                      title="Excluir pedido"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="order-card-items">
                  {order.itens.map((item, i) => (
                    <div key={i} className="order-card-item">
                      <span className="order-item-name">{item.nome}</span>
                      <span>{item.tipo} • {item.tamanho} • {item.genero}</span>
                      {item.personalizado && (
                        <span className="order-personalizado">
                          Personalizado: {item.nomePersonalizado} #{item.numeroPersonalizado}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {order.endereco && (
                  <div className="order-address">
                    <strong>Entrega:</strong> {order.endereco.rua}, {order.endereco.numero}
                    {order.endereco.complemento ? ` - ${order.endereco.complemento}` : ""}
                    {" "}- {order.endereco.bairro}, {order.endereco.cidade}/{order.endereco.estado}
                    {" "}| Tel: {order.endereco.telefone}
                  </div>
                )}

                <div className="order-card-footer">
                  <div className="order-card-total">Total: {formatarMoeda(order.total)}</div>
                  <div className="order-card-actions">
                    {order.status === "pendente" && (
                      <button
                        className="order-action-btn order-action-confirm"
                        onClick={() => updateOrderStatus(order.id, "confirmado")}
                      >
                        Confirmar Pagamento
                      </button>
                    )}
                    {order.status === "confirmado" && (
                      <>
                        <a href={whatsappUrl} target="_blank" rel="noreferrer" className="order-action-btn order-action-whatsapp">
                          Enviar ao Fornecedor
                        </a>
                        <button
                          className="order-action-btn order-action-delivery"
                          onClick={() => {
                            if (confirm(`Confirmar entrega do pedido ${order.id}?`)) {
                              confirmDelivery(order.id);
                            }
                          }}
                        >
                          Confirmar Entrega
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useCart } from "./CartContext";
import { formatarMoeda } from "./types";

export default function AdminHistory() {
  const { history, deleteHistoryOrder } = useCart();

  return (
    <div className="admin-container">
      <h2>Histórico de Pedidos ({history.length})</h2>

      {history.length === 0 ? (
        <p className="empty-msg">Nenhum pedido entregue ainda.</p>
      ) : (
        <div className="orders-list">
          {history.map((order) => (
            <div key={order.id} className="order-card order-card-history">
              <div className="order-card-header">
                <div>
                  <span className="order-id">{order.id}</span>
                  <span className="order-status entregue">Entregue</span>
                </div>
                <div className="order-header-right">
                  <div className="order-date">{order.data} {order.hora}</div>
                  <button
                    className="btn-delete-order"
                    onClick={() => {
                      if (confirm(`Remover pedido ${order.id} do histórico?`)) {
                        deleteHistoryOrder(order.id);
                      }
                    }}
                    title="Remover do histórico"
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

              <div className="order-card-footer">
                <div className="order-card-total">Total: {formatarMoeda(order.total)}</div>
                {order.endereco && (
                  <div className="order-address-summary">
                    {order.endereco.cidade}/{order.endereco.estado}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

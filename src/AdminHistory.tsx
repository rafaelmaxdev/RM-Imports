import { useCart } from "./CartContext";
import { formatarMoeda } from "./types";

export default function AdminHistory() {
  const { history, deleteHistoryOrder } = useCart();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h2 className="text-xl text-primary mb-6">Histórico de Pedidos ({history.length})</h2>

      {history.length === 0 ? (
        <p className="text-center text-text-muted py-8">Nenhum pedido entregue ainda.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {history.map((order) => (
            <div key={order.id} className="bg-card-bg rounded-md p-4 shadow-card opacity-85">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="font-bold text-lg text-primary">{order.id}</span>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold ml-2 bg-cyan-100 text-cyan-800">
                    Entregue
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-text-muted">{order.data} {order.hora}</div>
                  <button
                    className="bg-none border-none text-text-muted cursor-pointer text-sm leading-none hover:text-accent transition-colors"
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

              <div className="flex flex-col gap-2 mb-4">
                {order.itens.map((item, i) => (
                  <div key={i} className="flex flex-col gap-1 p-2 bg-bg-base rounded-md text-sm">
                    <span className="font-semibold">{item.nome}</span>
                    <span>{item.tipo} • {item.tamanho} • {item.genero}</span>
                    {item.personalizado && (
                      <span className="text-accent font-semibold">
                        Personalizado: {item.nomePersonalizado} #{item.numeroPersonalizado}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-border flex-wrap gap-3">
                <div className="font-bold text-lg">Total: {formatarMoeda(order.total)}</div>
                {order.endereco && (
                  <div className="text-sm text-text-muted">
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

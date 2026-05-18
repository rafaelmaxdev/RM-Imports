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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl text-primary m-0">Pedidos ({filteredOrders.length})</h2>
        <input
          type="text"
          placeholder="Buscar por ID, nome ou telefone..."
          className="px-3 py-2 border border-border rounded-md text-sm w-72"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredOrders.length === 0 ? (
        <p className="text-center text-text-muted py-8">Nenhum pedido encontrado.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredOrders.map((order) => {
            const msg = montarMensagemFornecedor(order);
            const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

            return (
              <div key={order.id} className="bg-card-bg rounded-md p-4 shadow-card">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="font-bold text-lg text-primary">{order.id}</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ml-2 ${
                        order.status === "pendente"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {order.status === "pendente" ? "Pendente" : "Confirmado"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-text-muted">{order.data} {order.hora}</div>
                    <button
                      className="bg-none border-none text-text-muted cursor-pointer text-sm leading-none hover:text-accent transition-colors"
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

                {order.endereco && (
                  <div className="text-sm text-text-muted p-2 bg-bg-base rounded-md mb-4">
                    <strong>Entrega:</strong> {order.endereco.rua}, {order.endereco.numero}
                    {order.endereco.complemento ? ` - ${order.endereco.complemento}` : ""}{" "}
                    - {order.endereco.bairro}, {order.endereco.cidade}/{order.endereco.estado} |
                    Tel: {order.endereco.telefone}
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-border flex-wrap gap-3">
                  <div className="font-bold text-lg">Total: {formatarMoeda(order.total)}</div>
                  <div className="flex gap-2">
                    {order.status === "pendente" && (
                      <button
                        className="inline-flex items-center justify-center px-4 py-2.5 rounded-md border-none text-sm font-semibold cursor-pointer transition-opacity hover:opacity-85 text-white bg-green-500 min-h-9.5 whitespace-nowrap"
                        onClick={() => updateOrderStatus(order.id, "confirmado")}
                      >
                        Confirmar Pagamento
                      </button>
                    )}
                    {order.status === "confirmado" && (
                      <>
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center px-4 py-2.5 rounded-md border-none text-sm font-semibold cursor-pointer transition-opacity hover:opacity-85 text-white bg-green-500 min-h-9.5 whitespace-nowrap no-underline"
                        >
                          Enviar ao Fornecedor
                        </a>
                        <button
                          className="inline-flex items-center justify-center px-4 py-2.5 rounded-md border-none text-sm font-semibold cursor-pointer transition-opacity hover:opacity-85 text-white bg-cyan-500 min-h-9.5 whitespace-nowrap"
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

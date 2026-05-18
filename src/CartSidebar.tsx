import { useState } from "react";
import { useCart } from "./CartContext";
import type { OrderAddress } from "./types";
import { formatarMoeda, proxyImageUrl } from "./types";

interface CartSidebarProps {
  onClose: () => void;
  onCheckout: (endereco: OrderAddress) => void;
}

const ESTADOS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export default function CartSidebar({ onClose, onCheckout }: CartSidebarProps) {
  const { cart, removeFromCart, total } = useCart();
  const [step, setStep] = useState<"cart" | "address">("cart");

  const [endereco, setEndereco] = useState<OrderAddress>({
    nome: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    cep: "",
    telefone: "",
  });

  const [erro, setErro] = useState("");

  function handleNext() {
    setStep("address");
  }

  function handleConfirm() {
    if (
      !endereco.nome.trim() ||
      !endereco.rua.trim() ||
      !endereco.numero.trim() ||
      !endereco.bairro.trim() ||
      !endereco.cidade.trim() ||
      !endereco.estado ||
      !endereco.cep.trim() ||
      !endereco.telefone.trim()
    ) {
      setErro("Preencha todos os campos obrigatórios.");
      return;
    }
    setErro("");
    onCheckout(endereco);
    onClose();
  }

  function updateField(field: keyof OrderAddress, value: string) {
    setEndereco((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[1000]" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-[400px] bg-card-bg flex flex-col shadow-[-4px_0_16px_rgba(0,0,0,0.1)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-border">
          <h3 className="m-0 text-primary font-semibold">
            {step === "cart" ? `Carrinho (${cart.length})` : "Endereço de Entrega"}
          </h3>
          <button className="bg-none border-none text-xl cursor-pointer text-text-muted" onClick={onClose}>
            ✕
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <p>Seu carrinho está vazio.</p>
          </div>
        ) : step === "cart" ? (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {cart.map((item, i) => (
                <div key={i} className="flex gap-3 py-3 border-b border-border">
                  <img
                    src={
                      proxyImageUrl(item.imagemUrl) ||
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Crect width='50' height='50' fill='%23eee'/%3E%3C/svg%3E"
                    }
                    alt={item.nome}
                    className="w-[50px] h-[50px] object-cover rounded-md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm whitespace-nowrap overflow-hidden text-ellipsis">
                      {item.nome}
                    </div>
                    <div className="text-xs text-text-muted">
                      {item.tamanho} • {item.genero}
                      {item.personalizado && ` • ${item.nomePersonalizado} #${item.numeroPersonalizado}`}
                    </div>
                    <div className="font-bold text-accent text-sm">{formatarMoeda(item.preco)}</div>
                  </div>
                  <button
                    className="bg-none border-none text-text-muted cursor-pointer text-lg py-1 hover:text-accent"
                    onClick={() => removeFromCart(i)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-border">
              <div className="flex justify-between font-bold text-lg mb-4">
                <span>Total:</span>
                <span>{formatarMoeda(total)}</span>
              </div>
              <button
                className="w-full py-3 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
                onClick={handleNext}
              >
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">Nome completo *</label>
                <input
                  type="text"
                  value={endereco.nome}
                  onChange={(e) => updateField("nome", e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">Telefone *</label>
                <input
                  type="tel"
                  value={endereco.telefone}
                  onChange={(e) => updateField("telefone", e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">CEP *</label>
                <input
                  type="text"
                  value={endereco.cep}
                  onChange={(e) => updateField("cep", e.target.value.replace(/[^0-9-]/g, ""))}
                  placeholder="00000-000"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-text-muted mb-1">Rua *</label>
                  <input
                    type="text"
                    value={endereco.rua}
                    onChange={(e) => updateField("rua", e.target.value)}
                    placeholder="Nome da rua"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-sm font-semibold text-text-muted mb-1">Número *</label>
                  <input
                    type="text"
                    value={endereco.numero}
                    onChange={(e) => updateField("numero", e.target.value)}
                    placeholder="123"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">Complemento</label>
                <input
                  type="text"
                  value={endereco.complemento}
                  onChange={(e) => updateField("complemento", e.target.value)}
                  placeholder="Apto, bloco, etc."
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">Bairro *</label>
                <input
                  type="text"
                  value={endereco.bairro}
                  onChange={(e) => updateField("bairro", e.target.value)}
                  placeholder="Bairro"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-text-muted mb-1">Cidade *</label>
                  <input
                    type="text"
                    value={endereco.cidade}
                    onChange={(e) => updateField("cidade", e.target.value)}
                    placeholder="Cidade"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-sm font-semibold text-text-muted mb-1">UF *</label>
                  <select
                    value={endereco.estado}
                    onChange={(e) => updateField("estado", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                  >
                    <option value="">UF</option>
                    {ESTADOS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {erro && <div className="text-accent text-sm text-center px-4">{erro}</div>}

            <div className="px-6 py-4 border-t border-border">
              <div className="flex justify-between font-bold text-lg mb-4">
                <span>Total:</span>
                <span>{formatarMoeda(total)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 py-3 text-sm font-semibold bg-border text-text-main rounded-md cursor-pointer transition-colors hover:bg-gray-300"
                  onClick={() => setStep("cart")}
                >
                  Voltar
                </button>
                <button
                  className="flex-1 py-3 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
                  onClick={handleConfirm}
                >
                  Finalizar Pedido
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

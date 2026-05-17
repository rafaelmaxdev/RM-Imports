import { useState } from "react";
import { useCart } from "./CartContext";
import type { OrderAddress } from "./types";
import { formatarMoeda } from "./types";

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
    if (!endereco.nome.trim() || !endereco.rua.trim() || !endereco.numero.trim() ||
        !endereco.bairro.trim() || !endereco.cidade.trim() || !endereco.estado ||
        !endereco.cep.trim() || !endereco.telefone.trim()) {
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
    <div className="cart-overlay" onClick={onClose}>
      <div className="cart-sidebar" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h3>{step === "cart" ? `Carrinho (${cart.length})` : "Endereço de Entrega"}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            <p>Seu carrinho está vazio.</p>
          </div>
        ) : step === "cart" ? (
          <>
            <div className="cart-items">
              {cart.map((item, i) => (
                <div key={i} className="cart-item">
                  <img
                    src={item.imagemUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Crect width='50' height='50' fill='%23eee'/%3E%3C/svg%3E"}
                    alt={item.nome}
                    className="cart-item-img"
                  />
                  <div className="cart-item-info">
                    <div className="cart-item-nome">{item.nome}</div>
                    <div className="cart-item-detalhes">
                      {item.tamanho} • {item.genero}
                      {item.personalizado && ` • ${item.nomePersonalizado} #${item.numeroPersonalizado}`}
                    </div>
                    <div className="cart-item-preco">{formatarMoeda(item.preco)}</div>
                  </div>
                  <button className="cart-item-remove" onClick={() => removeFromCart(i)}>✕</button>
                </div>
              ))}
            </div>

            <div className="cart-footer">
              <div className="cart-total">
                <span>Total:</span>
                <span>{formatarMoeda(total)}</span>
              </div>
              <button className="btn btn-add" onClick={handleNext}>
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="cart-address-form">
              <div className="address-field">
                <label>Nome completo *</label>
                <input type="text" value={endereco.nome} onChange={(e) => updateField("nome", e.target.value)} placeholder="Seu nome" />
              </div>
              <div className="address-field">
                <label>Telefone *</label>
                <input type="tel" value={endereco.telefone} onChange={(e) => updateField("telefone", e.target.value)} placeholder="(11) 99999-9999" />
              </div>
              <div className="address-field">
                <label>CEP *</label>
                <input type="text" value={endereco.cep} onChange={(e) => updateField("cep", e.target.value.replace(/[^0-9-]/g, ""))} placeholder="00000-000" />
              </div>
              <div className="address-row">
                <div className="address-field address-field-flex">
                  <label>Rua *</label>
                  <input type="text" value={endereco.rua} onChange={(e) => updateField("rua", e.target.value)} placeholder="Nome da rua" />
                </div>
                <div className="address-field address-field-small">
                  <label>Número *</label>
                  <input type="text" value={endereco.numero} onChange={(e) => updateField("numero", e.target.value)} placeholder="123" />
                </div>
              </div>
              <div className="address-field">
                <label>Complemento</label>
                <input type="text" value={endereco.complemento} onChange={(e) => updateField("complemento", e.target.value)} placeholder="Apto, bloco, etc." />
              </div>
              <div className="address-field">
                <label>Bairro *</label>
                <input type="text" value={endereco.bairro} onChange={(e) => updateField("bairro", e.target.value)} placeholder="Bairro" />
              </div>
              <div className="address-row">
                <div className="address-field address-field-flex">
                  <label>Cidade *</label>
                  <input type="text" value={endereco.cidade} onChange={(e) => updateField("cidade", e.target.value)} placeholder="Cidade" />
                </div>
                <div className="address-field address-field-small">
                  <label>UF *</label>
                  <select value={endereco.estado} onChange={(e) => updateField("estado", e.target.value)}>
                    <option value="">UF</option>
                    {ESTADOS.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {erro && <div className="address-erro">{erro}</div>}

            <div className="cart-footer">
              <div className="cart-total">
                <span>Total:</span>
                <span>{formatarMoeda(total)}</span>
              </div>
              <div className="cart-footer-buttons">
                <button className="btn btn-cancel" onClick={() => setStep("cart")}>
                  Voltar
                </button>
                <button className="btn btn-add" onClick={handleConfirm}>
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

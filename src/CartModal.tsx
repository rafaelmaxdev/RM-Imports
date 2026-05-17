import { useState } from "react";
import { useCart } from "./CartContext";
import type { CartItem } from "./types";
import { TAMANHOS, PRECOS_BASE, PRECO_PERSONALIZACAO, ADICIONAL_TAMANHO, formatarMoeda } from "./types";

interface CartModalProps {
  produto: {
    id: string;
    nome: string;
    imagem_url: string;
    yupoo_url: string;
    tipo: string;
    temporada: string;
  };
  onClose: () => void;
}

export default function CartModal({ produto, onClose }: CartModalProps) {
  const { addToCart } = useCart();
  const [tamanho, setTamanho] = useState("");
  const [genero, setGenero] = useState("Masculino");
  const [personalizado, setPersonalizado] = useState(false);
  const [nomePersonalizado, setNomePersonalizado] = useState("");
  const [numeroPersonalizado, setNumeroPersonalizado] = useState("");
  const [erro, setErro] = useState("");

  const precoBase = PRECOS_BASE[produto.tipo] || 89.90;
  const adicionalTam = ADICIONAL_TAMANHO[tamanho] || 0;
  const adicionalPers = personalizado ? PRECO_PERSONALIZACAO : 0;
  const precoFinal = precoBase + adicionalTam + adicionalPers;

  function handleConfirm() {
    if (!tamanho) {
      setErro("Selecione um tamanho.");
      return;
    }
    if (personalizado && (!nomePersonalizado.trim() || !numeroPersonalizado.trim())) {
      setErro("Preencha nome e número para personalização.");
      return;
    }

    const item: CartItem = {
      productId: produto.id,
      nome: produto.nome,
      imagemUrl: produto.imagem_url,
      yupooUrl: produto.yupoo_url,
      tipo: produto.tipo,
      temporada: produto.temporada,
      tamanho,
      genero,
      personalizado,
      nomePersonalizado: personalizado ? nomePersonalizado.trim() : undefined,
      numeroPersonalizado: personalizado ? numeroPersonalizado.trim() : undefined,
      preco: precoFinal,
    };

    addToCart(item);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>Adicionar ao Carrinho</h3>

        <div className="modal-produto-info">
          <img
            src={produto.imagem_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23eee'/%3E%3C/svg%3E"}
            alt={produto.nome}
            className="modal-produto-img"
          />
          <div>
            <div className="modal-produto-nome">{produto.nome}</div>
            <div className="modal-produto-preco">{formatarMoeda(precoBase)}</div>
          </div>
        </div>

        <div className="modal-field">
          <label>Tamanho</label>
          <div className="tamanho-grid">
            {TAMANHOS.map((t) => (
              <button
                key={t}
                className={`tamanho-btn ${tamanho === t ? "active" : ""}`}
                onClick={() => { setTamanho(t); setErro(""); }}
              >
                {t}
                {ADICIONAL_TAMANHO[t] && <span className="tamanho-add">+{formatarMoeda(ADICIONAL_TAMANHO[t])}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label>Modelo</label>
          <div className="genero-grid">
            {["Masculino", "Feminino"].map((g) => (
              <button
                key={g}
                className={`genero-btn ${genero === g ? "active" : ""}`}
                onClick={() => setGenero(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <div className="personalizar-row">
            <input
              id="personalizar-check"
              type="checkbox"
              checked={personalizado}
              onChange={(e) => { setPersonalizado(e.target.checked); setErro(""); }}
            />
            <label htmlFor="personalizar-check">
              Personalizar (+{formatarMoeda(PRECO_PERSONALIZACAO)})
            </label>
          </div>
        </div>

        {personalizado && (
          <>
            <div className="modal-field">
              <label>Nome</label>
              <input
                type="text"
                value={nomePersonalizado}
                onChange={(e) => { setNomePersonalizado(e.target.value.toUpperCase()); setErro(""); }}
                placeholder="ex: SILVA"
              />
            </div>
            <div className="modal-field">
              <label>Número</label>
              <input
                type="text"
                value={numeroPersonalizado}
                onChange={(e) => { setNumeroPersonalizado(e.target.value.replace(/[^0-9]/g, "")); setErro(""); }}
                placeholder="ex: 10"
              />
            </div>
          </>
        )}

        {erro && <div className="modal-erro">{erro}</div>}

        <div className="modal-price-summary">
          <span>Preço base:</span>
          <span>{formatarMoeda(precoBase)}</span>
          {adicionalTam > 0 && (
            <>
              <span>Tamanho {tamanho}:</span>
              <span>+{formatarMoeda(adicionalTam)}</span>
            </>
          )}
          {adicionalPers > 0 && (
            <>
              <span>Personalização:</span>
              <span>+{formatarMoeda(adicionalPers)}</span>
            </>
          )}
          <div className="modal-price-total">
            <span>Total:</span>
            <span>{formatarMoeda(precoFinal)}</span>
          </div>
        </div>

        <button
          className="btn btn-add modal-confirm"
          onClick={handleConfirm}
          disabled={!tamanho}
        >
          Adicionar ao Carrinho
        </button>
      </div>
    </div>
  );
}

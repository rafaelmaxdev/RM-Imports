import { useState } from "react";
import { useCart } from "./CartContext";
import type { CartItem } from "./types";
import {
  TAMANHOS,
  PRECOS_BASE,
  PRECO_PERSONALIZACAO,
  ADICIONAL_TAMANHO,
  formatarMoeda,
  proxyImageUrl,
} from "./types";

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
  onAdded: (nome: string) => void;
}

export default function CartModal({ produto, onClose, onAdded }: CartModalProps) {
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
    onAdded(produto.nome);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4" onClick={onClose}>
      <div className="bg-card-bg rounded-md p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
        <button className="absolute top-3 right-3 bg-none border-none text-xl cursor-pointer text-text-muted" onClick={onClose}>
          ✕
        </button>
        <h3 className="mb-4 text-primary font-semibold text-lg">Adicionar ao Carrinho</h3>

        <div className="flex gap-4 items-center mb-4 pb-4 border-b border-border">
          <img
            src={
              proxyImageUrl(produto.imagem_url) ||
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23eee'/%3E%3C/svg%3E"
            }
            alt={produto.nome}
            className="w-15 h-15 object-cover rounded-md"
          />
          <div>
            <div className="font-semibold text-sm">{produto.nome}</div>
            <div className="text-accent font-bold">{formatarMoeda(precoBase)}</div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-text-muted mb-2">Tamanho</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {TAMANHOS.filter((t) => !ADICIONAL_TAMANHO[t]).map((t) => (
              <button
                key={t}
                className={`px-3 py-1.5 border border-border bg-card-bg rounded-md cursor-pointer text-sm transition-colors ${
                  tamanho === t ? "bg-primary text-white border-primary" : ""
                }`}
                onClick={() => {
                  setTamanho(t);
                  setErro("");
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {TAMANHOS.filter((t) => ADICIONAL_TAMANHO[t]).map((t) => (
              <button
                key={t}
                className={`px-3 py-1.5 border border-border bg-card-bg rounded-md cursor-pointer text-sm transition-colors flex flex-col items-center gap-0.5 ${
                  tamanho === t ? "bg-primary text-white border-primary" : ""
                }`}
                onClick={() => {
                  setTamanho(t);
                  setErro("");
                }}
              >
                {t}
                <span className="text-xs text-accent font-semibold">
                  +{formatarMoeda(ADICIONAL_TAMANHO[t])}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-text-muted mb-2">Modelo</label>
          <div className="flex gap-2">
            {["Masculino", "Feminino"].map((g) => (
              <button
                key={g}
                className={`px-4 py-2 border border-border bg-card-bg rounded-md cursor-pointer text-sm transition-colors ${
                  genero === g ? "bg-primary text-white border-primary" : ""
                }`}
                onClick={() => setGenero(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-1">
            <input
              id="personalizar-check"
              type="checkbox"
              checked={personalizado}
              onChange={(e) => {
                setPersonalizado(e.target.checked);
                setErro("");
              }}
              className="w-4 h-4 accent-primary cursor-pointer m-0"
            />
            <label htmlFor="personalizar-check" className="text-sm font-medium cursor-pointer select-none">
              Personalizar (+{formatarMoeda(PRECO_PERSONALIZACAO)})
            </label>
          </div>
        </div>

        {personalizado && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-text-muted mb-2">Nome</label>
              <input
                type="text"
                value={nomePersonalizado}
                onChange={(e) => {
                  setNomePersonalizado(e.target.value.toUpperCase());
                  setErro("");
                }}
                placeholder="ex: SILVA"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-text-muted mb-2">Número</label>
              <input
                type="text"
                value={numeroPersonalizado}
                onChange={(e) => {
                  setNumeroPersonalizado(e.target.value.replace(/[^0-9]/g, ""));
                  setErro("");
                }}
                placeholder="ex: 10"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
              />
            </div>
          </>
        )}

        {erro && <div className="text-accent text-sm mb-3 text-center">{erro}</div>}

        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 p-3 bg-bg-base rounded-md mb-3 text-sm">
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
          <div className="col-span-2 flex justify-between font-bold text-base pt-2 border-t border-border mt-1">
            <span>Total:</span>
            <span>{formatarMoeda(precoFinal)}</span>
          </div>
        </div>

        <button
          className="w-full py-3 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleConfirm}
          disabled={!tamanho}
        >
          Adicionar ao Carrinho
        </button>
      </div>
    </div>
  );
}

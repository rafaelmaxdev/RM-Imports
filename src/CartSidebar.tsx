import { useState, useCallback, useRef, useEffect } from "react";
import { useCart } from "./CartContext";
import type { OrderAddress, PaymentMethod } from "./types";
import { formatarMoeda, proxyImageUrl } from "./types";

interface CartSidebarProps {
  onClose: () => void;
  onCheckout: (endereco: OrderAddress, paymentMethod: PaymentMethod) => void;
}

const ESTADOS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

interface ViaCepResponse {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

interface RuaSugestao {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

function formatarCep(valor: string): string {
  const digits = valor.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
}

function formatarTelefone(valor: string): string {
  const digits = valor.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

type Step = "cart" | "address" | "payment";

export default function CartSidebar({ onClose, onCheckout }: CartSidebarProps) {
  const { cart, removeFromCart, total } = useCart();
  const [step, setStep] = useState<Step>("cart");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");
  const [ruaSugestoes, setRuaSugestoes] = useState<RuaSugestao[]>([]);
  const [ruaLoading, setRuaLoading] = useState(false);
  const [showSugestoes, setShowSugestoes] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ruaRef = useRef<HTMLDivElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");

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

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ruaRef.current && !ruaRef.current.contains(e.target as Node)) {
        setShowSugestoes(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const buscarCep = useCallback(async (cepDigits: string) => {
    setCepLoading(true);
    setCepError("");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data: ViaCepResponse = await res.json();
      if (data.erro) {
        setCepError("CEP não encontrado.");
        return;
      }
      setEndereco((prev) => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: data.uf || prev.estado,
      }));
    } catch {
      setCepError("Erro ao buscar CEP. Verifique a conexão.");
    } finally {
      setCepLoading(false);
    }
  }, []);

  const buscarRuas = useCallback(async (query: string, uf: string, cidade: string) => {
    if (query.length < 3 || !uf || !cidade) {
      setRuaSugestoes([]);
      setShowSugestoes(false);
      return;
    }
    setRuaLoading(true);
    try {
      const res = await fetch(
        `https://viacep.com.br/ws/${uf}/${encodeURIComponent(cidade)}/${encodeURIComponent(query)}/json/`
      );
      const data: RuaSugestao[] = await res.json();
      setRuaSugestoes(Array.isArray(data) ? data.slice(0, 8) : []);
      setShowSugestoes(true);
    } catch {
      setRuaSugestoes([]);
    } finally {
      setRuaLoading(false);
    }
  }, []);

  function handleRuaChange(value: string) {
    updateField("rua", value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      buscarRuas(value, endereco.estado, endereco.cidade);
    }, 350);
  }

  function selecionarRua(sug: RuaSugestao) {
    setEndereco((prev) => ({
      ...prev,
      rua: sug.logradouro,
      bairro: sug.bairro || prev.bairro,
      cidade: sug.localidade || prev.cidade,
      estado: sug.uf || prev.estado,
      cep: sug.cep ? formatarCep(sug.cep) : prev.cep,
    }));
    setRuaSugestoes([]);
    setShowSugestoes(false);
    setErro("");
  }

  function handleNext() {
    if (step === "cart") setStep("address");
    else if (step === "address") setStep("payment");
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
    onCheckout(endereco, paymentMethod);
    onClose();
  }

  function updateField(field: keyof OrderAddress, value: string) {
    setEndereco((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }

  function handleCepChange(rawValue: string) {
    const formatted = formatarCep(rawValue);
    const digits = rawValue.replace(/\D/g, "").slice(0, 8);
    updateField("cep", formatted);
    setCepError("");

    if (digits.length === 8) {
      buscarCep(digits);
    }
  }

  const paymentOptions: { value: PaymentMethod; label: string; icon: string; desc: string }[] = [
    { value: "pix", label: "Pix", icon: "📱", desc: "Pagamento instantâneo" },
    { value: "credit_card", label: "Cartão de Crédito", icon: "💳", desc: "Parcele em até 12x" },
    { value: "debit_card", label: "Cartão de Débito", icon: "🏦", desc: "Débito à vista" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-[1000]" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-100 bg-card-bg flex flex-col shadow-[-4px_0_16px_rgba(0,0,0,0.1)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-border">
          <h3 className="m-0 text-primary font-semibold">
            {step === "cart" ? `Carrinho (${cart.length})` : step === "address" ? "Endereço de Entrega" : "Pagamento"}
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
                    className="w-12.5 h-12.5 object-cover rounded-md"
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
        ) : step === "address" ? (
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
                  onChange={(e) => updateField("telefone", formatarTelefone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  maxLength={15}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">CEP *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={endereco.cep}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg pr-9"
                  />
                  {cepLoading && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                {cepError && <p className="text-xs text-accent mt-1">{cepError}</p>}
                {!endereco.cep && (
                  <p className="text-[11px] text-text-muted mt-0.5">Preencha o CEP primeiro para buscar a rua automaticamente</p>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative" ref={ruaRef}>
                  <label className="block text-sm font-semibold text-text-muted mb-1">Rua *</label>
                  <input
                    type="text"
                    value={endereco.rua}
                    onChange={(e) => handleRuaChange(e.target.value)}
                    onFocus={() => ruaSugestoes.length > 0 && setShowSugestoes(true)}
                    placeholder="Comece a digitar a rua..."
                    autoComplete="off"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                  />
                  {ruaLoading && (
                    <div className="absolute right-2.5 top-[34px] w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  )}
                  {showSugestoes && ruaSugestoes.length > 0 && (
                    <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-card-bg border border-border rounded-md shadow-lg list-none m-0 p-0">
                      {ruaSugestoes.map((sug, i) => (
                        <li
                          key={i}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-border transition-colors border-b border-border last:border-b-0"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selecionarRua(sug);
                          }}
                        >
                          <div className="font-medium text-text-main">{sug.logradouro}</div>
                          <div className="text-xs text-text-muted">{sug.bairro} — {sug.localidade}/{sug.uf} · CEP {sug.cep}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {endereco.estado && endereco.cidade && (
                    <p className="text-[11px] text-text-muted mt-0.5">Buscando em {endereco.cidade}/{endereco.estado}</p>
                  )}
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
                  onClick={handleNext}
                >
                  Continuar
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <p className="text-sm text-text-muted mb-4">Escolha a forma de pagamento:</p>
              <div className="flex flex-col gap-2">
                {paymentOptions.map((opt) => (
                  <button
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors text-left ${
                      paymentMethod === opt.value
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-accent/50"
                    }`}
                    onClick={() => setPaymentMethod(opt.value)}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-text-main">{opt.label}</div>
                      <div className="text-xs text-text-muted">{opt.desc}</div>
                    </div>
                    {paymentMethod === opt.value && (
                      <span className="text-accent font-bold">✓</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-4 p-3 bg-primary/5 rounded-md border border-border">
                  <p className="text-xs text-text-muted">
                    {paymentMethod === "pix" && "Você será redirecionado ao Mercado Pago para pagar via Pix. O pagamento é instantâneo e a confirmação é automática."}
                    {paymentMethod === "credit_card" && "Você será redirecionado ao Mercado Pago para pagar com cartão de crédito. Parcelamento em até 12x disponível."}
                    {paymentMethod === "debit_card" && "Você será redirecionado ao Mercado Pago para pagar com cartão de débito."}
                  </p>
                </div>
            </div>

            <div className="px-6 py-4 border-t border-border">
              <div className="flex justify-between font-bold text-lg mb-4">
                <span>Total:</span>
                <span>{formatarMoeda(total)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 py-3 text-sm font-semibold bg-border text-text-main rounded-md cursor-pointer transition-colors hover:bg-gray-300"
                  onClick={() => setStep("address")}
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
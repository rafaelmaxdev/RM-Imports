import { useState, useCallback, useRef, useEffect } from "react";
import { useCart } from "./CartContext";
import type { OrderAddress, PaymentMethod } from "./types";
import { formatarMoeda, proxyImageUrl } from "./types";

interface CartSidebarProps {
  onClose: () => void;
  onCheckout: (endereco: OrderAddress, paymentMethod: PaymentMethod) => void;
}

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
    cidade: "Bezerros",
    estado: "PE",
    cep: "",
    telefone: "",
    deliveryMethod: "entrega" as const,
  });

  const [erro, setErro] = useState("");

  // Fechar dropdown ao clicar fora + limpar debounce ao desmontar
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ruaRef.current && !ruaRef.current.contains(e.target as Node)) {
        setShowSugestoes(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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
      setEndereco((prev) => {
        const cidade = data.localidade || prev.cidade;
        const estado = data.uf || prev.estado;
        const next = {
          ...prev,
          rua: data.logradouro || prev.rua,
          bairro: data.bairro || prev.bairro,
          cidade,
          estado,
        };
        // Validate for entrega mode
        if (prev.deliveryMethod === "entrega") {
          if (cidade.toLowerCase() !== "bezerros" || estado !== "PE") {
            setErro("Entrega disponível apenas para Bezerros-PE.");
          } else {
            setErro("");
          }
        }
        return next;
      });
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
    if (step === "cart") {
      setStep("address");
    } else if (step === "address") {
      if (endereco.deliveryMethod === "entrega") {
        if (
          !endereco.nome.trim() ||
          !endereco.telefone.trim() ||
          !endereco.rua.trim() ||
          !endereco.numero.trim() ||
          !endereco.bairro.trim() ||
          !endereco.cep.trim()
        ) {
          setErro("Preencha todos os campos obrigatórios.");
          return;
        }
        if (endereco.cidade.toLowerCase() !== "bezerros" || endereco.estado !== "PE") {
          setErro("Entrega disponível apenas para Bezerros-PE.");
          return;
        }
      } else {
        // retirada
        if (!endereco.nome.trim() || !endereco.telefone.trim()) {
          setErro("Preencha nome e telefone.");
          return;
        }
      }
      setErro("");
      setStep("payment");
    }
  }

  function handleConfirm() {
    if (endereco.deliveryMethod === "entrega") {
      if (
        !endereco.nome.trim() ||
        !endereco.telefone.trim() ||
        !endereco.rua.trim() ||
        !endereco.numero.trim() ||
        !endereco.bairro.trim() ||
        !endereco.cep.trim()
      ) {
        setErro("Preencha todos os campos obrigatórios.");
        return;
      }
      if (endereco.cidade.toLowerCase() !== "bezerros" || endereco.estado !== "PE") {
        setErro("Entrega disponível apenas para Bezerros-PE.");
        return;
      }
    } else {
      // retirada
      if (!endereco.nome.trim() || !endereco.telefone.trim()) {
        setErro("Preencha nome e telefone.");
        return;
      }
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

  function handleDeliveryMethodChange(method: "entrega" | "retirada") {
    if (method === endereco.deliveryMethod) return;
    setErro("");
    if (method === "retirada") {
      // Auto-fill Caruaru data
      setEndereco((prev) => ({
        ...prev,
        deliveryMethod: "retirada",
        cidade: "Caruaru",
        estado: "PE",
        rua: "Retirada em Caruaru",
        numero: "S/N",
        bairro: "Centro",
        cep: "55000-000",
      }));
    } else {
      // Switching to entrega — pre-fill Bezerros/PE so street search works immediately
      setEndereco((prev) => ({
        ...prev,
        deliveryMethod: "entrega",
        rua: "",
        numero: "",
        bairro: "",
        cidade: "Bezerros",
        estado: "PE",
        cep: "",
      }));
    }
  }

  const paymentOptions: { value: PaymentMethod; label: string; icon: string; desc: string }[] = [
    { value: "pix", label: "Pix", icon: "📱", desc: "Pagamento instantâneo" },
    { value: "credit_card", label: "Cartão de Crédito", icon: "💳", desc: "Parcele em até 12x" },
    { value: "debit_card", label: "Cartão de Débito", icon: "🏦", desc: "Débito à vista" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-[1000] transition-colors duration-300" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-100 bg-card-bg flex flex-col shadow-[-8px_0_32px_rgba(0,0,0,0.2)] transition-transform duration-300 ease-out" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-border">
          <h3 className="m-0 text-primary font-semibold">
            {step === "cart" ? `Carrinho (${cart.length})` : step === "address" ? (endereco.deliveryMethod === "retirada" ? "Dados para Retirada" : "Endereço de Entrega") : "Pagamento"}
          </h3>
          <button className="bg-none border-none text-xl cursor-pointer text-text-muted hover:text-accent transition-colors w-8 h-8 flex items-center justify-center rounded-full" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Step indicators */}
        {cart.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-b border-border">
            <div className="flex items-center justify-center gap-1 text-xs font-semibold">
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors ${step === 'cart' ? 'bg-accent text-white' : 'text-text-muted'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 'cart' ? 'bg-white text-accent' : 'bg-gray-300 text-white'}`}>1</span>
                Carrinho
              </span>
              <span className="text-border mx-1">→</span>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors ${step === 'address' ? 'bg-accent text-white' : step === 'payment' ? 'text-primary' : 'text-text-muted'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 'address' ? 'bg-white text-accent' : step === 'payment' ? 'bg-primary text-white' : 'bg-gray-300 text-white'}`}>2</span>
                  {endereco.deliveryMethod === "retirada" ? "Retirada" : "Entrega"}
                </span>
              <span className="text-border mx-1">→</span>
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors ${step === 'payment' ? 'bg-accent text-white' : 'text-text-muted'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 'payment' ? 'bg-white text-accent' : 'bg-gray-300 text-white'}`}>3</span>
                Pagamento
              </span>
            </div>
          </div>
        )}

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
                    loading="lazy"
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
              {/* Delivery method selector */}
              <div className="flex gap-2">
                <button
                  className={`flex-1 flex flex-col items-center gap-0.5 p-3 rounded-lg border cursor-pointer transition-colors text-center ${
                    endereco.deliveryMethod === "entrega"
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-accent/50"
                  }`}
                  onClick={() => handleDeliveryMethodChange("entrega")}
                >
                  <span className="text-lg">🚚</span>
                  <span className="text-sm font-semibold text-text-main">Entrega em Bezerros</span>
                  <span className="text-[11px] text-text-muted">Receba em casa</span>
                </button>
                <button
                  className={`flex-1 flex flex-col items-center gap-0.5 p-3 rounded-lg border cursor-pointer transition-colors text-center ${
                    endereco.deliveryMethod === "retirada"
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-accent/50"
                  }`}
                  onClick={() => handleDeliveryMethodChange("retirada")}
                >
                  <span className="text-lg">🏪</span>
                  <span className="text-sm font-semibold text-text-main">Retirada em Caruaru</span>
                  <span className="text-[11px] text-text-muted">Busque pessoalmente</span>
                </button>
              </div>

              {/* Warning box */}
              <div className="p-3 bg-yellow-50 rounded-md border border-yellow-200">
                <p className="text-xs text-yellow-800 font-semibold">⚠️ Dados importantes</p>
                <p className="text-xs text-yellow-700 mt-1">
                  Certifique-se de preencher nome e telefone corretos. Usaremos essas informações para contato sobre seu pedido e atualizações de entrega.
                </p>
              </div>

              {/* Nome — always visible */}
              <div>
                <label htmlFor="cart-nome" className="block text-sm font-semibold text-text-muted mb-1">Nome completo *</label>
                <input
                  id="cart-nome"
                  type="text"
                  value={endereco.nome}
                  onChange={(e) => updateField("nome", e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>

              {/* Telefone — always visible */}
              <div>
                <label htmlFor="cart-telefone" className="block text-sm font-semibold text-text-muted mb-1">Telefone *</label>
                <input
                  id="cart-telefone"
                  type="tel"
                  value={endereco.telefone}
                  onChange={(e) => updateField("telefone", formatarTelefone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  maxLength={15}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>

              {endereco.deliveryMethod === "entrega" ? (
                <>
                  {/* Entrega fields — Rua first for Bezerros street search */}
                  <div className="p-2.5 bg-green-50 rounded-md border border-green-200">
                    <p className="text-xs text-green-800 font-semibold">🎉 Frete grátis — Entrega em Bezerros!</p>
                    <p className="text-[11px] text-green-700 mt-0.5">Digite o nome da rua e selecione o endereço. CEP e bairro serão preenchidos automaticamente.</p>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 relative" ref={ruaRef}>
                      <label htmlFor="cart-rua" className="block text-sm font-semibold text-text-muted mb-1">Rua *</label>
                      <input
                        id="cart-rua"
                        type="text"
                        value={endereco.rua}
                        onChange={(e) => handleRuaChange(e.target.value)}
                        onFocus={() => ruaSugestoes.length > 0 && setShowSugestoes(true)}
                        placeholder="Digite o nome da rua..."
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
                              <div className="text-xs text-text-muted">{sug.bairro} — CEP {sug.cep}</div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-[11px] text-text-muted mt-0.5">Buscando ruas em Bezerros-PE</p>
                    </div>
                    <div className="w-20">
                      <label htmlFor="cart-numero" className="block text-sm font-semibold text-text-muted mb-1">Número *</label>
                      <input
                        id="cart-numero"
                        type="text"
                        value={endereco.numero}
                        onChange={(e) => updateField("numero", e.target.value)}
                        placeholder="123"
                        className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="cart-complemento" className="block text-sm font-semibold text-text-muted mb-1">Complemento</label>
                    <input
                      id="cart-complemento"
                      type="text"
                      value={endereco.complemento}
                      onChange={(e) => updateField("complemento", e.target.value)}
                      placeholder="Apto, bloco, etc."
                      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                    />
                  </div>
                  <div>
                    <label htmlFor="cart-bairro" className="block text-sm font-semibold text-text-muted mb-1">Bairro *</label>
                    <input
                      id="cart-bairro"
                      type="text"
                      value={endereco.bairro}
                      onChange={(e) => updateField("bairro", e.target.value)}
                      placeholder="Preenchido automaticamente ao selecionar a rua"
                      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                    />
                  </div>
                  <div>
                    <label htmlFor="cart-cep" className="block text-sm font-semibold text-text-muted mb-1">CEP *</label>
                    <div className="relative">
                      <input
                        id="cart-cep"
                        type="text"
                        value={endereco.cep}
                        onChange={(e) => handleCepChange(e.target.value)}
                        placeholder="Preenchido automaticamente"
                        maxLength={9}
                        className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg pr-9"
                      />
                      {cepLoading && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                    {cepError && <p className="text-xs text-accent mt-1">{cepError}</p>}
                    <p className="text-[11px] text-text-muted mt-0.5">Preenchido automaticamente ao selecionar a rua, ou digite manualmente</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label htmlFor="cart-cidade" className="block text-sm font-semibold text-text-muted mb-1">Cidade</label>
                      <input
                        id="cart-cidade"
                        type="text"
                        value={endereco.cidade}
                        readOnly
                        className="w-full px-3 py-2 text-sm border border-border rounded-md bg-gray-100 text-text-muted"
                      />
                    </div>
                    <div className="w-20">
                      <label htmlFor="cart-estado" className="block text-sm font-semibold text-text-muted mb-1">UF</label>
                      <input
                        id="cart-estado"
                        type="text"
                        value={endereco.estado}
                        readOnly
                        className="w-full px-3 py-2 text-sm border border-border rounded-md bg-gray-100 text-text-muted"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Retirada info box */}
                  <div className="p-3 bg-primary/5 rounded-md border border-border">
                    <p className="text-sm font-semibold text-text-main">📍 Retirada em Caruaru</p>
                    <p className="text-xs text-text-muted mt-1">
                      Retirada na <strong className="text-text-main">Magazine Luiza</strong> — Centro de Caruaru
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      Após o pagamento, avisaremos quando o pedido estiver disponível para retirada.
                    </p>
                  </div>
                </>
              )}
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
                    role="radio"
                    aria-checked={paymentMethod === opt.value}
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

              <div className="mt-4 p-3 bg-yellow-50 rounded-md border border-yellow-200">
                <p className="text-xs text-yellow-800 font-semibold">⚠️ Importante:</p>
                <ul className="text-xs text-yellow-700 mt-1 space-y-1 list-disc list-inside">
                  <li>Confira seus dados antes de finalizar</li>
                  <li>Após o pagamento, guarde o ID da transação para suporte</li>
                  <li>A confirmação é automática via Mercado Pago</li>
                </ul>
              </div>

              {endereco.deliveryMethod === "retirada" && (
                <div className="mt-4 p-3 bg-blue-50 rounded-md border border-blue-200">
                  <p className="text-xs text-blue-800 font-semibold">📍 Retirada na Magazine Luiza — Centro de Caruaru</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Após a confirmação do pagamento, avisaremos quando o pedido estiver disponível para retirada na Magazine Luiza, no Centro de Caruaru.
                  </p>
                </div>
              )}

              {endereco.deliveryMethod === "entrega" && (
                <div className="mt-4 p-3 bg-green-50 rounded-md border border-green-200">
                  <p className="text-xs text-green-800 font-semibold">🎉 Frete grátis — Entrega em Bezerros</p>
                  <p className="text-xs text-green-700 mt-1">
                    Sua entrega em Bezerros-PE é gratuita! Após a confirmação do pagamento, entraremos em contato para agendar a entrega.
                  </p>
                </div>
              )}
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
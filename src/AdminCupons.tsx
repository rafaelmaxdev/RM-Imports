import { useState, useEffect } from "react";
import { getCupons, createCupom, updateCupom, deleteCupom, getCupomRevenue } from "./lib/db";
import type { Cupom } from "./types";
import { formatarMoeda } from "./types";

type CupomRevenue = {
  descontos: number;
  pedidos: number;
  faturamento: number;
  comissao: number;
};

function normalizarHandle(value: string): string {
  const handle = value.trim().replace(/^@+/, "").trim();
  return handle ? `@${handle}` : "";
}

function mensagemErroCriarCupom(error: unknown): string {
  const details = typeof error === "object" && error !== null
    ? error as { code?: unknown; message?: unknown }
    : {};
  const code = typeof details.code === "string" ? details.code : "";
  const message = typeof details.message === "string" ? details.message : "";
  const normalizedMessage = message.toLowerCase();
  const missingSecurityColumn = [
    "uso_unico_por_cliente",
    "influenciador_handle",
    "rev_share_percentual",
  ].some((column) => normalizedMessage.includes(column) && (
    normalizedMessage.includes("could not find") ||
    normalizedMessage.includes("not found") ||
    normalizedMessage.includes("does not exist") ||
    normalizedMessage.includes("unknown column") ||
    normalizedMessage.includes("schema cache") ||
    normalizedMessage.includes("missing") ||
    normalizedMessage.includes("não existe") ||
    normalizedMessage.includes("nao existe") ||
    normalizedMessage.includes("ausente")
  ));

  if (code === "23505") return "Já existe um cupom com esse código.";
  if (code === "42501" || /row-level security|permission denied/i.test(message)) {
    return "Sua sessão não tem permissão para criar cupons. Entre novamente.";
  }
  if (code === "PGRST204" || missingSecurityColumn) {
    return "O banco de dados precisa da atualização de segurança dos cupons.";
  }
  return "Não foi possível criar o cupom. Tente novamente.";
}

export default function AdminCupons() {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [revenue, setRevenue] = useState<Record<string, CupomRevenue>>({});
  const [loading, setLoading] = useState(true);
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<"porcentagem" | "fixo">("porcentagem");
  const [valor, setValor] = useState("");
  const [usoMaximo, setUsoMaximo] = useState("");
  const [valorMinimo, setValorMinimo] = useState("");
  const [dataExpiracao, setDataExpiracao] = useState("");
  const [descontoMaximo, setDescontoMaximo] = useState("");
  const [usoUnicoPorCliente, setUsoUnicoPorCliente] = useState(true);
  const [influenciador, setInfluenciador] = useState(false);
  const [influenciadorHandle, setInfluenciadorHandle] = useState("");
  const [revSharePercentual, setRevSharePercentual] = useState("");
  const [observacaoInterna, setObservacaoInterna] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);

  useEffect(() => {
    loadCupons();
  }, []);

  async function loadCupons() {
    try {
      const data = await getCupons();
      setCupons(data);
      const revMap: Record<string, CupomRevenue> = {};
      await Promise.all(data.map(async (c) => {
        try { revMap[c.codigo] = await getCupomRevenue(c.codigo); }
        catch { revMap[c.codigo] = { descontos: 0, pedidos: 0, faturamento: 0, comissao: 0 }; }
      }));
      setRevenue(revMap);
    } catch (err) {
      console.error("Erro ao carregar cupons:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    const valorNumero = Number(valor);
    if (!codigo.trim()) {
      setMessage("Informe um código para o cupom.");
      setMessageError(true);
      return;
    }
    if (!valor.trim() || !Number.isFinite(valorNumero) || valorNumero <= 0) {
      setMessage("Informe um valor maior que 0 para o cupom.");
      setMessageError(true);
      return;
    }
    if (tipo === "porcentagem" && valorNumero > 100) {
      setMessage("A porcentagem deve ser maior que 0 e no máximo 100%.");
      setMessageError(true);
      return;
    }

    if (tipo === "porcentagem" && descontoMaximo.trim() && (!Number.isFinite(Number(descontoMaximo)) || Number(descontoMaximo) < 0)) {
      setMessage("Informe um desconto máximo válido.");
      setMessageError(true);
      return;
    }
    if (usoMaximo.trim() && (!Number.isInteger(Number(usoMaximo)) || Number(usoMaximo) < 0)) {
      setMessage("Informe um limite de usos inteiro e não negativo.");
      setMessageError(true);
      return;
    }
    if (valorMinimo.trim() && (!Number.isFinite(Number(valorMinimo)) || Number(valorMinimo) < 0)) {
      setMessage("Informe um valor mínimo válido.");
      setMessageError(true);
      return;
    }

    const handleNormalizado = normalizarHandle(influenciadorHandle);
    const revShare = Number(revSharePercentual);
    if (influenciador && !handleNormalizado) {
      setMessage("Informe o @ do influenciador.");
      setMessageError(true);
      return;
    }
    if (influenciador && (!revSharePercentual.trim() || !Number.isFinite(revShare) || revShare < 0 || revShare > 100)) {
      setMessage("O rev share deve ser informado entre 0 e 100%.");
      setMessageError(true);
      return;
    }

    setSaving(true);
    try {
      await createCupom({
        codigo: codigo.toUpperCase().trim(),
        tipo,
        valor: valorNumero,
        desconto_maximo: descontoMaximo.trim() ? Number(descontoMaximo) : null,
        uso_maximo: usoMaximo.trim() ? Number(usoMaximo) : null,
        valor_minimo_pedido: valorMinimo.trim() ? Number(valorMinimo) : null,
        data_expiracao: dataExpiracao || null,
        ativo: true,
        uso_unico_por_cliente: usoUnicoPorCliente,
        influenciador,
        influenciador_handle: influenciador ? handleNormalizado : null,
        rev_share_percentual: influenciador ? revShare : null,
        observacao_interna: influenciador && observacaoInterna.trim() ? observacaoInterna.trim() : null,
      });
      setMessage("Cupom criado!");
      setMessageError(false);
      setCodigo("");
      setTipo("porcentagem");
      setValor("");
      setUsoMaximo("");
      setValorMinimo("");
      setDataExpiracao("");
      setDescontoMaximo("");
      setUsoUnicoPorCliente(true);
      setInfluenciador(false);
      setInfluenciadorHandle("");
      setRevSharePercentual("");
      setObservacaoInterna("");
      await loadCupons();
    } catch (err) {
      console.error("Erro ao criar cupom:", err);
      setMessage(mensagemErroCriarCupom(err));
      setMessageError(true);
    } finally {
      setSaving(false);
      setTimeout(() => {
        setMessage("");
        setMessageError(false);
      }, 3000);
    }
  }

  async function handleToggleAtivo(id: string, ativo: boolean) {
    try {
      await updateCupom(id, { ativo });
      setCupons((prev) => prev.map((c) => (c.id === id ? { ...c, ativo } : c)));
    } catch (err) {
      console.error("Erro ao atualizar cupom:", err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este cupom?")) return;
    try {
      await deleteCupom(id);
      setCupons((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Erro ao excluir cupom:", err);
    }
  }

  if (loading) return <div className="text-center py-8 text-text-muted">Carregando cupons...</div>;

  return (
    <div className="pb-16">
      <h3 className="text-xl mb-4 text-primary">Cupons de Desconto</h3>

      {message && (
        <div className={`mb-4 px-4 py-2 rounded-md text-sm font-medium ${
          messageError ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
        }`}>
          {message}
        </div>
      )}

      {/* Create form */}
      <div className="p-4 bg-card-bg rounded-lg border border-border mb-6">
        <h4 className="text-sm font-semibold text-text-muted mb-3">Novo Cupom</h4>
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Código (ex: BEMVINDO10)"
            className="px-3 py-2 text-sm border border-border rounded-md bg-bg-base"
          />
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={usoUnicoPorCliente}
              onChange={(e) => setUsoUnicoPorCliente(e.target.checked)}
              className="accent-accent"
            />
            <span>Um uso por cliente (telefone)</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={influenciador}
              onChange={(e) => setInfluenciador(e.target.checked)}
              className="accent-accent"
            />
            <span>Cupom de influenciador</span>
          </label>
          {influenciador && (
            <div className="flex flex-col gap-3 p-3 rounded-md border border-border bg-bg-base/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="influenciador-handle" className="block text-xs font-semibold text-text-muted mb-1">
                    @ do influenciador <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="influenciador-handle"
                    type="text"
                    value={influenciadorHandle}
                    onChange={(e) => setInfluenciadorHandle(e.target.value)}
                    placeholder="@exemplo"
                    aria-label="Handle do influenciador"
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg-base"
                  />
                </div>
                <div>
                  <label htmlFor="rev-share-percentual" className="block text-xs font-semibold text-text-muted mb-1">
                    Rev share (%) <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="rev-share-percentual"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={revSharePercentual}
                    onChange={(e) => setRevSharePercentual(e.target.value)}
                    placeholder="Ex: 10"
                    aria-label="Rev share (%)"
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg-base"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">
                  Observação interna <span className="font-normal">(opcional)</span>
                </label>
                <textarea
                  value={observacaoInterna}
                  onChange={(e) => setObservacaoInterna(e.target.value)}
                  rows={2}
                  placeholder="Anotações para uso interno"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg-base resize-y"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "porcentagem" | "fixo")}
              className="px-3 py-2 text-sm border border-border rounded-md bg-bg-base"
            >
              <option value="porcentagem">Porcentagem (%)</option>
              <option value="fixo">Valor Fixo (R$)</option>
            </select>
            <input
              type="number"
              step={tipo === "porcentagem" ? "1" : "0.01"}
              min="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={tipo === "porcentagem" ? "Ex: 10" : "Ex: 20.00"}
              className="px-3 py-2 text-sm border border-border rounded-md bg-bg-base"
            />
          </div>
          {tipo === "porcentagem" && (
            <input
              type="number"
              step="0.01"
              min="0"
              value={descontoMaximo}
              onChange={(e) => setDescontoMaximo(e.target.value)}
              placeholder="Desconto máximo em R$ (opcional — ex: 30,00)"
              className="px-3 py-2 text-sm border border-border rounded-md bg-bg-base"
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min="0"
              value={usoMaximo}
              onChange={(e) => setUsoMaximo(e.target.value)}
              placeholder="Usos máximos (opcional)"
              className="px-3 py-2 text-sm border border-border rounded-md bg-bg-base"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={valorMinimo}
              onChange={(e) => setValorMinimo(e.target.value)}
              placeholder="Valor mínimo pedido (opcional)"
              className="px-3 py-2 text-sm border border-border rounded-md bg-bg-base"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              Validade do cupom <span className="font-normal text-text-muted">(opcional — deixe em branco para não expirar)</span>
            </label>
            <input
              type="date"
              value={dataExpiracao}
              onChange={(e) => setDataExpiracao(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg-base"
            />
          </div>
          <button
            className="w-full py-2.5 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? "Criando..." : "Criar Cupom"}
          </button>
        </div>
      </div>

      {/* Cupons list */}
      {cupons.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-8">Nenhum cupom cadastrado.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {cupons.map((c) => (
            <div
              key={c.id}
              className={`p-4 rounded-lg border-2 transition-colors ${
                c.ativo ? "border-accent/40 bg-accent/5" : "border-border bg-card-bg opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-primary font-mono">{c.codigo}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      c.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {c.ativo ? "ATIVO" : "INATIVO"}
                    </span>
                    {c.influenciador && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700">
                        Influenciador
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-text-muted mt-1">
                    {c.tipo === "porcentagem" ? `${c.valor}% OFF` : `R$ ${c.valor.toFixed(2)} OFF`}
                    {c.tipo === "porcentagem" && c.desconto_maximo !== null && ` (máx. R$ ${c.desconto_maximo.toFixed(2)})`}
                    {c.uso_maximo !== null
                      ? ` • ${c.usos_atuais}/${c.uso_maximo} usos (${c.uso_maximo - c.usos_atuais} restantes)`
                      : ` • ${c.usos_atuais} uso(s)`}
                    {c.valor_minimo_pedido !== null && ` • Mín: R$ ${c.valor_minimo_pedido.toFixed(2)}`}
                    {c.data_expiracao
                      ? ` • Expira em ${new Date(c.data_expiracao).toLocaleDateString("pt-BR")}`
                      : ` • Sem data de expiração`}
                  </div>
                  {(c.influenciador || c.uso_unico_por_cliente) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted mt-1.5">
                      {c.influenciador && c.influenciador_handle && <span>{normalizarHandle(c.influenciador_handle)}</span>}
                      {c.influenciador && c.rev_share_percentual != null && <span>Rev share: {c.rev_share_percentual}%</span>}
                      {c.uso_unico_por_cliente && <span>1 uso por telefone</span>}
                    </div>
                  )}
                  {revenue[c.codigo] && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted mt-1.5">
                      <span className="font-semibold text-green-700">{revenue[c.codigo].pedidos} pedido(s)</span>
                      <span>Faturamento gerado: <span className="font-semibold">{formatarMoeda(revenue[c.codigo].faturamento)}</span></span>
                      <span>Descontos: <span className="font-semibold">{formatarMoeda(revenue[c.codigo].descontos)}</span></span>
                      {c.influenciador && (
                        <span>Comissão: <span className="font-semibold">{formatarMoeda(revenue[c.codigo].comissao)}</span></span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                      c.ativo ? "bg-accent" : "bg-gray-300"
                    }`}
                    onClick={() => handleToggleAtivo(c.id, !c.ativo)}
                    title={c.ativo ? "Desativar" : "Ativar"}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      c.ativo ? "left-[22px]" : "left-0.5"
                    }`} />
                  </button>
                  <button
                    className="px-2 py-1 text-xs font-semibold bg-red-500 text-white rounded cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => handleDelete(c.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

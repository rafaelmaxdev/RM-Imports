import { useState, useEffect } from "react";
import { getCupons, createCupom, updateCupom, deleteCupom, getCupomRevenue } from "./lib/db";
import type { Cupom } from "./types";
import { formatarMoeda } from "./types";

export default function AdminCupons() {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [revenue, setRevenue] = useState<Record<string, { total: number; pedidos: number }>>({});
  const [loading, setLoading] = useState(true);
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<"porcentagem" | "fixo">("porcentagem");
  const [valor, setValor] = useState("");
  const [usoMaximo, setUsoMaximo] = useState("");
  const [valorMinimo, setValorMinimo] = useState("");
  const [dataExpiracao, setDataExpiracao] = useState("");
  const [descontoMaximo, setDescontoMaximo] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadCupons();
  }, []);

  async function loadCupons() {
    try {
      const data = await getCupons();
      setCupons(data);
      const revMap: Record<string, { total: number; pedidos: number }> = {};
      await Promise.all(data.map(async (c) => {
        try { revMap[c.codigo] = await getCupomRevenue(c.codigo); }
        catch { revMap[c.codigo] = { total: 0, pedidos: 0 }; }
      }));
      setRevenue(revMap);
    } catch (err) {
      console.error("Erro ao carregar cupons:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!codigo.trim() || !valor) return;
    setSaving(true);
    try {
      await createCupom({
        codigo: codigo.toUpperCase().trim(),
        tipo,
        valor: parseFloat(valor),
        desconto_maximo: descontoMaximo ? parseFloat(descontoMaximo) : null,
        uso_maximo: usoMaximo ? parseInt(usoMaximo) : null,
        valor_minimo_pedido: valorMinimo ? parseFloat(valorMinimo) : null,
        data_expiracao: dataExpiracao || null,
        ativo: true,
      });
      setMessage("Cupom criado!");
      setCodigo("");
      setValor("");
      setUsoMaximo("");
      setValorMinimo("");
      setDataExpiracao("");
      setDescontoMaximo("");
      await loadCupons();
    } catch (err) {
      console.error("Erro ao criar cupom:", err);
      setMessage("Erro ao criar cupom.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
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
        <div className="mb-4 px-4 py-2 bg-green-100 text-green-800 rounded-md text-sm font-medium">
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
              min="0"
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
            disabled={saving || !codigo.trim() || !valor}
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
                  {revenue[c.codigo] && revenue[c.codigo].pedidos > 0 && (
                    <div className="text-xs text-text-muted mt-1.5">
                      <span className="font-semibold text-green-700">{revenue[c.codigo].pedidos} pedido(s)</span> com este cupom
                      {revenue[c.codigo].total > 0 && (
                        <span> — <span className="font-semibold">{formatarMoeda(revenue[c.codigo].total)}</span> em descontos concedidos</span>
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

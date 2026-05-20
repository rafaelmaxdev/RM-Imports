import { useState, useEffect, useMemo } from "react";
import type { DbProduto } from "./lib/db";
import { setPromocaoCategoria, updateProduto, parseImageUrls } from "./lib/db";
import type { LojaConfig, PromocaoTipo } from "./types";
import { TIPOS_CATEGORIA, DEFAULT_CONFIG, formatarMoeda, proxyImageUrl } from "./types";
import { updateLojaConfig } from "./lib/db";

interface AdminPromocoesProps {
  produtos: DbProduto[];
  setProdutos: React.Dispatch<React.SetStateAction<DbProduto[]>>;
  config: LojaConfig;
  setConfig: React.Dispatch<React.SetStateAction<LojaConfig>>;
}

export default function AdminPromocoes({ produtos, setProdutos, config, setConfig }: AdminPromocoesProps) {
  const [precosBase, setPrecosBase] = useState<Record<string, string>>({});
  const [precosPromo, setPrecosPromo] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Product-specific promo state
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [savingProduto, setSavingProduto] = useState<string | null>(null);

  useEffect(() => {
    const pb: Record<string, string> = {};
    const pp: Record<string, string> = {};
    for (const tipo of TIPOS_CATEGORIA) {
      pb[tipo] = String(config.precos_base[tipo] ?? DEFAULT_CONFIG.precos_base[tipo]);
      pp[tipo] = String(config.precos_promocao[tipo] ?? DEFAULT_CONFIG.precos_promocao[tipo]);
    }
    setPrecosBase(pb);
    setPrecosPromo(pp);
  }, [config]);

  async function handleTogglePromo(tipo: string, ativa: boolean) {
    try {
      const newAtiva = { ...config.promocao_ativa, [tipo]: ativa };
      await updateLojaConfig("promocao_ativa", newAtiva);
      await setPromocaoCategoria(tipo, ativa);
      setConfig((prev) => ({ ...prev, promocao_ativa: newAtiva }));
      setProdutos((prev) =>
        prev.map((p) => (p.tipo === tipo ? { ...p, promocao: ativa } : p))
      );
      setMessage(`${ativa ? "Promoção ativada" : "Promoção desativada"} para ${tipo}`);
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao toggle promoção:", err);
    }
  }

  async function handleToggleAll(ativa: boolean) {
    try {
      const newAtiva: Record<string, boolean> = {};
      for (const tipo of TIPOS_CATEGORIA) {
        newAtiva[tipo] = ativa;
      }
      await Promise.all([
        updateLojaConfig("promocao_ativa", newAtiva),
        ...TIPOS_CATEGORIA.map((tipo) => setPromocaoCategoria(tipo, ativa)),
      ]);
      setConfig((prev) => ({ ...prev, promocao_ativa: newAtiva }));
      setProdutos((prev) =>
        prev.map((p) => ({ ...p, promocao: ativa }))
      );
      setMessage(ativa ? "Todas as promoções ativadas" : "Todas as promoções desativadas");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao toggle todas:", err);
      setMessage("Erro ao atualizar promoções. Tente uma por uma.");
      setTimeout(() => setMessage(""), 4000);
    }
  }

  async function handleSavePrecos() {
    setSaving(true);
    try {
      const newBase: Record<string, number> = {};
      const newPromo: Record<string, number> = {};
      for (const tipo of TIPOS_CATEGORIA) {
        newBase[tipo] = parseFloat(precosBase[tipo]) || DEFAULT_CONFIG.precos_base[tipo];
        newPromo[tipo] = parseFloat(precosPromo[tipo]) || DEFAULT_CONFIG.precos_promocao[tipo];
      }
      await updateLojaConfig("precos_base", newBase);
      await updateLojaConfig("precos_promocao", newPromo);
      setConfig((prev) => ({ ...prev, precos_base: newBase, precos_promocao: newPromo }));
      setMessage("Preços salvos com sucesso!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao salvar preços:", err);
      setMessage("Erro ao salvar preços.");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetProductPromo(
    id: string,
    promocao: boolean,
    promocao_tipo: string | null,
    promocao_valor: number | null,
    preco_customizado: number | null
  ) {
    setSavingProduto(id);
    try {
      const updated = await updateProduto(id, {
        promocao,
        promocao_tipo,
        promocao_valor,
        preco_customizado: preco_customizado,
      });
      setProdutos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setMessage("Promoção do produto atualizada!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao atualizar promoção do produto:", err);
      setMessage("Erro ao atualizar promoção.");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSavingProduto(null);
    }
  }

  async function handleRemoveProductPromo(id: string) {
    setSavingProduto(id);
    try {
      const updated = await updateProduto(id, {
        promocao: false,
        promocao_tipo: null,
        promocao_valor: null,
        preco_customizado: null,
      });
      setProdutos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setMessage("Promoção removida do produto.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao remover promoção:", err);
    } finally {
      setSavingProduto(null);
    }
  }

  const allActive = TIPOS_CATEGORIA.every((t) => config.promocao_ativa[t]);

  const produtosEmPromocao = useMemo(
    () => produtos.filter((p) => p.promocao && p.promocao_tipo),
    [produtos]
  );

  const resultadosBusca = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return produtos.filter((p) => {
      if (p.promocao && p.promocao_tipo) return false;
      if (filtroTipo && p.tipo !== filtroTipo) return false;
      if (q) {
        const campos = [p.nome, p.time, p.liga, p.tipo, p.temporada].join(" ").toLowerCase();
        if (!campos.includes(q)) return false;
      }
      return true;
    }).slice(0, 20);
  }, [produtos, busca, filtroTipo]);

  return (
    <div className="pb-16">
      <h3 className="text-xl mb-4 text-primary">Promoções & Preços</h3>

      {message && (
        <div className="mb-4 px-4 py-2 bg-green-100 text-green-800 rounded-md text-sm font-medium">
          {message}
        </div>
      )}

      {/* Toggle all */}
      <div className="flex gap-2 mb-6">
        <button
          className={`px-4 py-2 text-sm font-semibold rounded-md cursor-pointer transition-colors ${
            allActive
              ? "bg-accent text-white"
              : "bg-green-500 text-white hover:opacity-90"
          }`}
          onClick={() => handleToggleAll(true)}
          disabled={allActive}
        >
          Ativar Todas
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold rounded-md cursor-pointer transition-colors ${
            !TIPOS_CATEGORIA.some((t) => config.promocao_ativa[t])
              ? "bg-accent text-white"
              : "bg-red-500 text-white hover:opacity-90"
          }`}
          onClick={() => handleToggleAll(false)}
          disabled={!TIPOS_CATEGORIA.some((t) => config.promocao_ativa[t])}
        >
          Desativar Todas
        </button>
      </div>

      {/* Category cards */}
      <div className="flex flex-col gap-4 mb-8">
        {TIPOS_CATEGORIA.map((tipo) => {
          const ativa = config.promocao_ativa[tipo] ?? false;
          const basePrice = config.precos_base[tipo] ?? DEFAULT_CONFIG.precos_base[tipo];
          const promoPrice = config.precos_promocao[tipo] ?? DEFAULT_CONFIG.precos_promocao[tipo];
          const count = produtos.filter((p) => p.tipo === tipo).length;

          return (
            <div
              key={tipo}
              className={`p-4 rounded-lg border-2 transition-colors ${
                ativa ? "border-accent bg-accent/5" : "border-border bg-card-bg"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-bold text-base text-primary">{tipo}</h4>
                  <span className="text-xs text-text-muted">{count} produtos</span>
                </div>
                <button
                  className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                    ativa ? "bg-accent" : "bg-gray-300"
                  }`}
                  onClick={() => handleTogglePromo(tipo, !ativa)}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      ativa ? "left-[26px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">
                    Preço Base
                  </label>
                  <div className="px-3 py-2 bg-bg-base rounded-md text-sm font-medium">
                    {formatarMoeda(basePrice)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">
                    Preço Promoção
                  </label>
                  <div className="px-3 py-2 bg-bg-base rounded-md text-sm font-medium">
                    {formatarMoeda(promoPrice)}
                  </div>
                </div>
              </div>

              {ativa && (
                <div className="mt-2 text-xs text-accent font-semibold">
                  Economia de {formatarMoeda(basePrice - promoPrice)} por unidade
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit prices */}
      <div className="border-t border-border pt-6 mb-10">
        <h4 className="text-lg font-bold text-primary mb-4">Editar Preços</h4>
        <div className="flex flex-col gap-4">
          {TIPOS_CATEGORIA.map((tipo) => (
            <div key={tipo} className="grid grid-cols-[120px_1fr_1fr] gap-3 items-center">
              <span className="font-semibold text-sm">{tipo}</span>
              <div>
                <label className="block text-[10px] text-text-muted mb-0.5">Preço Base (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precosBase[tipo] ?? ""}
                  onChange={(e) => setPrecosBase((prev) => ({ ...prev, [tipo]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-muted mb-0.5">Preço Promoção (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precosPromo[tipo] ?? ""}
                  onChange={(e) => setPrecosPromo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
            </div>
          ))}
        </div>
        <button
          className="mt-4 w-full py-3 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
          onClick={handleSavePrecos}
          disabled={saving}
        >
          {saving ? "Salvando..." : "Salvar Preços"}
        </button>
      </div>

      {/* ── Product-specific promotions ── */}
      <div className="border-t border-border pt-6">
        <h4 className="text-lg font-bold text-primary mb-2">Promoção por Produto</h4>
        <p className="text-sm text-text-muted mb-4">
          Crie promoções individuais: desconto por %, novo preço fixo ou Leve 1 Pague 2.
        </p>

        {/* Current product promos */}
        {produtosEmPromocao.length > 0 && (
          <div className="mb-6">
            <h5 className="text-sm font-semibold text-text-muted mb-2">
              Produtos em promoção individual ({produtosEmPromocao.length})
            </h5>
            <div className="flex flex-col gap-2">
              {produtosEmPromocao.map((p) => {
                const imgs = parseImageUrls(p.imagem_urls);
                const img = imgs.length > 0 ? proxyImageUrl(imgs[0].replace(/\/(small|medium|large)\.jpg$/i, "/small.jpg")) : "";
                const tipoLabel =
                  p.promocao_tipo === "porcentagem" ? `${p.promocao_valor}% OFF` :
                  p.promocao_tipo === "novo_preco" ? `Por ${formatarMoeda(p.preco_customizado ?? 0)}` :
                  p.promocao_tipo === "leve_pague" ? "Leve 1 Pague 2" : p.promocao_tipo;

                return (
                  <div key={p.id} className="flex items-center gap-3 p-2 bg-card-bg rounded-md border border-accent/30">
                    {img ? (
                      <img src={img} alt={p.nome} className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-text-muted text-xs">—</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{p.nome}</div>
                      <div className="text-xs text-accent font-semibold">{tipoLabel}</div>
                    </div>
                    <button
                      className="px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                      onClick={() => handleRemoveProductPromo(p.id)}
                      disabled={savingProduto === p.id}
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search to add */}
        <div className="border-t border-border pt-4">
          <h5 className="text-sm font-semibold text-text-muted mb-2">Adicionar promoção a um produto</h5>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, time, liga..."
              className="flex-1 px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
            />
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
            >
              <option value="">Todos os tipos</option>
              {["Torcedor", "Jogador", "Manga Longa", "Retrô"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {(busca || filtroTipo) && (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {resultadosBusca.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-4">Nenhum produto encontrado.</p>
              ) : (
                resultadosBusca.map((p) => (
                  <ProductPromoRow
                    key={p.id}
                    produto={p}
                    config={config}
                    saving={savingProduto}
                    onApply={handleSetProductPromo}
                  />
                ))
              )}
            </div>
          )}

          {(!busca && !filtroTipo) && (
            <p className="text-text-muted text-sm text-center py-4">Digite algo para buscar produtos.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductPromoRow({
  produto,
  config,
  saving,
  onApply,
}: {
  produto: DbProduto;
  config: LojaConfig;
  saving: string | null;
  onApply: (id: string, promocao: boolean, promocao_tipo: string | null, promocao_valor: number | null, preco_customizado: number | null) => void;
}) {
  const [tipo, setTipo] = useState<string>("");
  const [valor, setValor] = useState("");
  const [novoPreco, setNovoPreco] = useState("");

  const basePrice = config.precos_base[produto.tipo] ?? 89.90;
  const imgs = parseImageUrls(produto.imagem_urls);
  const img = imgs.length > 0 ? proxyImageUrl(imgs[0].replace(/\/(small|medium|large)\.jpg$/i, "/small.jpg")) : "";

  function handleApply() {
    const promocaoTipo = (tipo || null) as PromocaoTipo;
    let promocaoValor: number | null = null;
    let precoCustomizado: number | null = null;

    if (tipo === "porcentagem") {
      promocaoValor = parseFloat(valor) || null;
    } else if (tipo === "novo_preco") {
      precoCustomizado = parseFloat(novoPreco) || null;
    }

    onApply(produto.id, true, promocaoTipo, promocaoValor, precoCustomizado);
  }

  return (
    <div className="p-3 bg-card-bg rounded-md border border-border">
      <div className="flex items-center gap-3 mb-3">
        {img ? (
          <img src={img} alt={produto.nome} className="w-10 h-10 object-cover rounded" />
        ) : (
          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-text-muted text-xs">—</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{produto.nome}</div>
          <div className="text-xs text-text-muted">{produto.tipo} • {produto.temporada} • {formatarMoeda(basePrice)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <select
          value={tipo}
          onChange={(e) => { setTipo(e.target.value); setValor(""); setNovoPreco(""); }}
          className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
        >
          <option value="">Tipo de promoção</option>
          <option value="porcentagem">Desconto por %</option>
          <option value="novo_preco">Novo preço fixo</option>
          <option value="leve_pague">Leve 1 Pague 2</option>
        </select>

        {tipo === "porcentagem" && (
          <input
            type="number"
            min="1"
            max="99"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Desconto em % (ex: 20)"
            className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
          />
        )}

        {tipo === "novo_preco" && (
          <input
            type="number"
            step="0.01"
            value={novoPreco}
            onChange={(e) => setNovoPreco(e.target.value)}
            placeholder="Novo preço (ex: 99.90)"
            className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
          />
        )}

        {tipo === "leve_pague" && (
          <div className="text-xs text-accent font-medium px-1">
            🏷️ O cliente leva 2 unidades pelo preço de 1
          </div>
        )}

        {tipo && (
          <button
            className="w-full py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
            onClick={handleApply}
            disabled={saving === produto.id}
          >
            {saving === produto.id ? "Salvando..." : "Aplicar Promoção"}
          </button>
        )}
      </div>
    </div>
  );
}
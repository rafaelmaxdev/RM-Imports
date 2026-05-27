import { useState, useEffect, useMemo } from "react";
import type { DbProduto } from "./lib/db";
import { setPromocaoCategoria, updateProduto, parseImageUrls } from "./lib/db";
import type { LojaConfig, PromocaoTipo } from "./types";
import { TIPOS_CATEGORIA, DEFAULT_CONFIG, formatarMoeda, proxyImageUrl } from "./types";
import { normalizarBusca } from "./lib/utils";
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

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTipo, setEditTipo] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editNovoPreco, setEditNovoPreco] = useState("");

  // Filter state
  const [promoFilter, setPromoFilter] = useState<"ativas" | "todas" | "inativas">("ativas");

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

  async function handleToggleProductPromo(id: string, ativa: boolean) {
    setSavingProduto(id);
    try {
      const updated = await updateProduto(id, { promocao: ativa });
      setProdutos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setMessage(ativa ? "Promoção ativada!" : "Promoção desativada");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao toggle promoção do produto:", err);
      setMessage("Erro ao atualizar promoção.");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSavingProduto(null);
    }
  }

  function handleStartEdit(p: DbProduto) {
    setEditingId(p.id);
    setEditTipo(p.promocao_tipo ?? "");
    setEditValor(p.promocao_valor != null ? String(p.promocao_valor) : "");
    setEditNovoPreco(p.preco_customizado != null ? String(p.preco_customizado) : "");
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditTipo("");
    setEditValor("");
    setEditNovoPreco("");
  }

  async function handleEditProductPromo(id: string) {
    setSavingProduto(id);
    try {
      const promocaoTipo = (editTipo || null) as PromocaoTipo;
      let promocaoValor: number | null = null;
      let precoCustomizado: number | null = null;

      if (editTipo === "porcentagem") {
        promocaoValor = parseFloat(editValor) || null;
      } else if (editTipo === "novo_preco") {
        precoCustomizado = parseFloat(editNovoPreco) || null;
      }

      const updated = await updateProduto(id, {
        promocao_tipo: promocaoTipo,
        promocao_valor: promocaoValor,
        preco_customizado: precoCustomizado,
      });
      setProdutos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setEditingId(null);
      setMessage("Promoção atualizada!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao editar promoção:", err);
      setMessage("Erro ao atualizar promoção.");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSavingProduto(null);
    }
  }

  const allActive = TIPOS_CATEGORIA.every((t) => config.promocao_ativa[t]);

  // Products with individual promo config (promocao_tipo !== null)
  const produtosComPromocao = useMemo(
    () => produtos.filter((p) => p.promocao_tipo !== null),
    [produtos]
  );

  // Filtered view
  const produtosFiltrados = useMemo(() => {
    switch (promoFilter) {
      case "ativas":
        return produtosComPromocao.filter((p) => p.promocao);
      case "inativas":
        return produtosComPromocao.filter((p) => !p.promocao);
      case "todas":
        return produtosComPromocao;
    }
  }, [produtosComPromocao, promoFilter]);

  // Stats
  const promosAtivasCategoria = TIPOS_CATEGORIA.filter((t) => config.promocao_ativa[t]).length;
  const promosAtivasProduto = produtosComPromocao.filter((p) => p.promocao).length;

  const resultadosBusca = useMemo(() => {
    const q = normalizarBusca(busca);
    return produtos.filter((p) => {
      if (p.promocao_tipo) return false;
      if (filtroTipo && p.tipo !== filtroTipo) return false;
      if (q) {
        const campos = normalizarBusca([p.nome, p.time, p.tipo, p.temporada].join(" "));
        if (!campos.includes(q)) return false;
      }
      return true;
    }).slice(0, 20);
  }, [produtos, busca, filtroTipo]);

  function getPromoLabel(p: DbProduto): string {
    if (p.promocao_tipo === "porcentagem") return `${p.promocao_valor}% OFF`;
    if (p.promocao_tipo === "novo_preco") return `Por ${formatarMoeda(p.preco_customizado ?? 0)}`;
    if (p.promocao_tipo === "leve_pague") return "Leve 1 Pague 2";
    if (p.promocao_tipo === "leve_3_pague_2") return "Leve 3 Pague 2";
    return p.promocao_tipo ?? "";
  }

  return (
    <div className="pb-16">
      <h3 className="text-xl mb-4 text-primary">Promoções & Preços</h3>

      {message && (
        <div className="mb-4 px-4 py-2 bg-green-100 text-green-800 rounded-md text-sm font-medium">
          {message}
        </div>
      )}

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg text-center">
          <div className="text-2xl font-bold text-accent">{promosAtivasCategoria}</div>
          <div className="text-xs text-text-muted mt-0.5">Categorias em promoção</div>
        </div>
        <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg text-center">
          <div className="text-2xl font-bold text-accent">{promosAtivasProduto}</div>
          <div className="text-xs text-text-muted mt-0.5">Produtos em promoção</div>
        </div>
      </div>

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
          Gerencie promoções individuais: ative, desative, edite ou remova.
        </p>

        {/* Current product promos */}
        {produtosComPromocao.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-sm font-semibold text-text-muted">
                Promoções individuais ({produtosComPromocao.length})
              </h5>
              <div className="flex gap-1 bg-bg-base rounded-md p-0.5">
                {(["ativas", "todas", "inativas"] as const).map((f) => (
                  <button
                    key={f}
                    className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                      promoFilter === f
                        ? "bg-accent text-white"
                        : "text-text-muted hover:text-primary"
                    }`}
                    onClick={() => setPromoFilter(f)}
                  >
                    {f === "ativas" ? "Ativas" : f === "todas" ? "Todas" : "Inativas"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {produtosFiltrados.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-4">
                  {promoFilter === "ativas" ? "Nenhuma promoção ativa." : promoFilter === "inativas" ? "Nenhuma promoção inativa." : "Nenhuma promoção cadastrada."}
                </p>
              ) : (
                produtosFiltrados.map((p) => {
                  const imgs = parseImageUrls(p.imagem_urls);
                  const img = imgs.length > 0 ? proxyImageUrl(imgs[0].replace(/\/(small|medium|large)\.jpg$/i, "/small.jpg")) : "";
                  const isEditing = editingId === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        p.promocao
                          ? "border-accent/40 bg-accent/5"
                          : "border-border bg-card-bg opacity-70"
                      }`}
                    >
                      {/* Card header */}
                      <div className="flex items-center gap-3">
                        {img ? (
                          <img src={img} alt={p.nome} className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-text-muted text-xs">—</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{p.nome}</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold ${p.promocao ? "text-accent" : "text-text-muted"}`}>
                              {getPromoLabel(p)}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              p.promocao
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              {p.promocao ? "ATIVA" : "INATIVA"}
                            </span>
                          </div>
                        </div>

                        {/* Toggle switch */}
                        <button
                          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                            p.promocao ? "bg-accent" : "bg-gray-300"
                          }`}
                          onClick={() => handleToggleProductPromo(p.id, !p.promocao)}
                          disabled={savingProduto === p.id}
                          title={p.promocao ? "Desativar promoção" : "Ativar promoção"}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              p.promocao ? "left-[22px]" : "left-0.5"
                            }`}
                          />
                        </button>

                        {/* Edit button */}
                        <button
                          className="px-2 py-1 text-xs font-semibold bg-blue-500 text-white rounded cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                          onClick={() => isEditing ? handleCancelEdit() : handleStartEdit(p)}
                          disabled={savingProduto === p.id}
                          title="Editar promoção"
                        >
                          {isEditing ? "✕" : "✎"}
                        </button>

                        {/* Remove button */}
                        <button
                          className="px-2 py-1 text-xs font-semibold bg-red-500 text-white rounded cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                          onClick={() => handleRemoveProductPromo(p.id)}
                          disabled={savingProduto === p.id}
                          title="Remover promoção"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Edit form */}
                      {isEditing && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="flex flex-col gap-2">
                            <select
                              value={editTipo}
                              onChange={(e) => { setEditTipo(e.target.value); setEditValor(""); setEditNovoPreco(""); }}
                              className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                            >
                              <option value="">Tipo de promoção</option>
                              <option value="porcentagem">Desconto por %</option>
                              <option value="novo_preco">Novo preço fixo</option>
                              <option value="leve_pague">Leve 1 Pague 2</option>
                              <option value="leve_3_pague_2">Leve 3 Pague 2</option>
                            </select>

                            {editTipo === "porcentagem" && (
                              <input
                                type="number"
                                min="1"
                                max="99"
                                value={editValor}
                                onChange={(e) => setEditValor(e.target.value)}
                                placeholder="Desconto em % (ex: 20)"
                                className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                              />
                            )}

                            {editTipo === "novo_preco" && (
                              <input
                                type="number"
                                step="0.01"
                                value={editNovoPreco}
                                onChange={(e) => setEditNovoPreco(e.target.value)}
                                placeholder="Novo preço (ex: 99.90)"
                                className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                              />
                            )}

                            {editTipo === "leve_pague" && (
                              <div className="text-xs text-accent font-medium px-1">
                                O cliente leva 2 unidades pelo preço de 1
                              </div>
                            )}

                            {editTipo === "leve_3_pague_2" && (
                              <div className="text-xs text-accent font-medium px-1">
                                O cliente leva 3 unidades e paga apenas 2
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                className="flex-1 py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                                onClick={() => handleEditProductPromo(p.id)}
                                disabled={savingProduto === p.id || !editTipo}
                              >
                                {savingProduto === p.id ? "Salvando..." : "Salvar"}
                              </button>
                              <button
                                className="px-4 py-2 text-sm font-semibold bg-gray-200 text-gray-700 rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={handleCancelEdit}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
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
              {["Torcedor", "Jogador", "Manga Longa Torcedor", "Manga Longa Jogador", "Manga Longa Retrô", "Retrô", "Goleiro", "Treinamento", "Polo", "NBA"].map((t) => (
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
          <option value="leve_3_pague_2">Leve 3 Pague 2</option>
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
            O cliente leva 2 unidades pelo preço de 1
          </div>
        )}

        {tipo === "leve_3_pague_2" && (
          <div className="text-xs text-accent font-medium px-1">
            O cliente leva 3 unidades e paga apenas 2
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
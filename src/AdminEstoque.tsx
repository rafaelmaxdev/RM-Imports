import { useState, useEffect, useMemo } from "react";
import type { DbProduto } from "./lib/db";
import { getEstoque, addEstoqueItem, updateEstoqueItem, deleteEstoqueItem, criarVendaDireta } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import { getCachedImageUrl, TAMANHOS_POR_TIPO, TIPOS_SEM_PERSONALIZACAO, getPrecoProduto, ADICIONAL_TAMANHO, PRONTA_ENTREGA_MARKUP } from "./types";
import type { EstoqueItem, LojaConfig } from "./types";
import { buscaPorPalavras } from "./lib/utils";
import type { PromocaoTipo } from "./types";

interface AdminEstoqueProps {
  produtos: DbProduto[];
  config: LojaConfig;
}

export default function AdminEstoque({ produtos, config }: AdminEstoqueProps) {
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add form state
  const [busca, setBusca] = useState("");
  const [selectedProdutoId, setSelectedProdutoId] = useState("");
  // Multi-size quantities: maps size label -> quantity (only > 0 are submitted)
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>({});
  const [personalizado, setPersonalizado] = useState(false);
  const [nomePersonalizado, setNomePersonalizado] = useState("");
  const [numeroPersonalizado, setNumeroPersonalizado] = useState("");
  const [feminino, setFeminino] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Venda Direta state
  const [showVendaDireta, setShowVendaDireta] = useState(false);
  const [vendaItem, setVendaItem] = useState<EstoqueItem | null>(null);
  const [vendaNomeCliente, setVendaNomeCliente] = useState("");
  const [vendaSaving, setVendaSaving] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantidade, setEditQuantidade] = useState("");

  async function loadEstoque() {
    try {
      setLoading(true);
      const data = await getEstoque();
      setEstoque(data);
    } catch (err) {
      console.error("Erro ao carregar estoque:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEstoque();
  }, []);

  // Group estoque items by produto_id
  const grouped = useMemo(() => {
    const map = new Map<string, EstoqueItem[]>();
    for (const item of estoque) {
      const existing = map.get(item.produto_id);
      if (existing) {
        existing.push(item);
      } else {
        map.set(item.produto_id, [item]);
      }
    }
    return map;
  }, [estoque]);

  // Search results for adding products
  const resultados = useMemo(() => {
    if (!busca.trim()) return [];
    return produtos.filter((p) => buscaPorPalavras(busca, p.nome)).slice(0, 20);
  }, [produtos, busca]);

  const selectedProduto = useMemo(
    () => produtos.find((p) => p.id === selectedProdutoId),
    [produtos, selectedProdutoId]
  );

  const tamanhosDisponiveis = selectedProduto
    ? TAMANHOS_POR_TIPO[selectedProduto.tipo] ?? []
    : [];
  const semPersonalizacao = selectedProduto
    ? TIPOS_SEM_PERSONALIZACAO.includes(selectedProduto.tipo)
    : false;

  // Initialize size quantities when product changes
  useEffect(() => {
    if (!tamanhosDisponiveis.length) {
      setSizeQuantities({});
      return;
    }
    // If only one size available, auto-fill with quantity 1
    if (tamanhosDisponiveis.length === 1) {
      setSizeQuantities({ [tamanhosDisponiveis[0]]: 1 });
    } else {
      setSizeQuantities(Object.fromEntries(tamanhosDisponiveis.map((t) => [t, 0])));
    }
  }, [selectedProdutoId]);

  async function handleAdd() {
    if (!selectedProdutoId) return;
    // Collect sizes with quantity > 0
    const entriesToAdd = Object.entries(sizeQuantities).filter(
      ([, qty]) => qty > 0
    );
    if (entriesToAdd.length === 0) return;
    // Validate personalization: nome and número are required together
    if (personalizado && (!nomePersonalizado.trim() || !numeroPersonalizado.trim())) {
      alert("Preencha nome e número para personalização.");
      return;
    }
    setSaving(true);
    try {
      const addedItems = await Promise.all(
        entriesToAdd.map(([tamanho, qty]) =>
          addEstoqueItem(
            selectedProdutoId, tamanho, qty,
            personalizado,
            personalizado ? nomePersonalizado : undefined,
            personalizado ? numeroPersonalizado : undefined,
            feminino,
          )
        )
      );
      // Update local state with all added items
      setEstoque((prev) => {
        const next = [...prev];
        for (const added of addedItems) {
          const idx = next.findIndex(
            (e) => e.produto_id === added.produto_id && e.tamanho === added.tamanho
          );
          if (idx >= 0) {
            next[idx] = added;
          } else {
            next.push(added);
          }
        }
        return next;
      });
      // Show success message
      const totalQty = entriesToAdd.reduce((s, [, q]) => s + q, 0);
      const sizeLabels = entriesToAdd.map(([t, q]) => `${t}:${q}`).join(", ");
      setSuccessMessage(
        `${totalQty} unidade(s) adicionada(s): ${sizeLabels}`
      );
      // Reset form
      setSelectedProdutoId("");
      setSizeQuantities({});
      setBusca("");
      setPersonalizado(false);
      setNomePersonalizado("");
      setNumeroPersonalizado("");
      setFeminino(false);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao adicionar estoque:", err);
      alert("Erro ao adicionar item ao estoque.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, novaQuantidade: number) {
    if (novaQuantidade < 0) return;
    try {
      await updateEstoqueItem(id, novaQuantidade);
      setEstoque((prev) =>
        prev.map((e) => (e.id === id ? { ...e, quantidade: novaQuantidade } : e))
      );
    } catch (err) {
      console.error("Erro ao atualizar estoque:", err);
      alert("Erro ao atualizar quantidade.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este item do estoque?")) return;
    try {
      await deleteEstoqueItem(id);
      setEstoque((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error("Erro ao remover item:", err);
      alert("Erro ao remover item do estoque.");
    }
  }

  // Venda Direta handler
  async function handleVendaDireta() {
    if (!vendaItem || !vendaNomeCliente.trim()) return;
    setVendaSaving(true);
    try {
      const p = produtos.find((pr) => pr.id === vendaItem.produto_id);
      const priceInfo = getPrecoProduto(
        p?.tipo ?? vendaItem.produto_tipo ?? "",
        config,
        p?.preco_customizado ?? null,
        (p?.promocao_tipo as PromocaoTipo) ?? undefined,
        p?.promocao_valor ?? null,
      );
      const basePrice = priceInfo.promo ?? priceInfo.base;
      const adicionalTam = ADICIONAL_TAMANHO[vendaItem.tamanho] || 0;
      const preco = Math.round((basePrice + adicionalTam) * PRONTA_ENTREGA_MARKUP * 100) / 100;

      await criarVendaDireta(
        [{
          produtoId: vendaItem.produto_id,
          nome: vendaItem.produto_nome ?? "Produto",
          tipo: p?.tipo ?? vendaItem.produto_tipo ?? "",
          temporada: p?.temporada ?? vendaItem.produto_temporada ?? "",
          tamanho: vendaItem.tamanho,
          preco,
          personalizado: vendaItem.personalizado ?? false,
          nomePersonalizado: vendaItem.nome_personalizado ?? undefined,
          numeroPersonalizado: vendaItem.numero_personalizado ?? undefined,
          feminino: vendaItem.feminino,
        }],
        vendaNomeCliente.trim(),
      );

      // Update local state
      setEstoque((prev) =>
        prev.map((e) => e.id === vendaItem.id ? { ...e, quantidade: Math.max(0, e.quantidade - 1) } : e)
      );
      setSuccessMessage(`Venda registrada para ${vendaNomeCliente.trim()}!`);
      setTimeout(() => setSuccessMessage(""), 3000);
      setShowVendaDireta(false);
      setVendaItem(null);
      setVendaNomeCliente("");
    } catch (err) {
      console.error("Erro ao registrar venda direta:", err);
      alert("Erro ao registrar venda.");
    } finally {
      setVendaSaving(false);
    }
  }


  function startEdit(item: EstoqueItem) {
    setEditingId(item.id);
    setEditQuantidade(item.quantidade.toString());
  }

  function cancelEdit() {
    setEditingId(null);
    setEditQuantidade("");
  }

  function saveEdit(id: string) {
    const val = parseInt(editQuantidade, 10);
    if (!isNaN(val) && val >= 0) {
      handleUpdate(id, val);
    }
    setEditingId(null);
    setEditQuantidade("");
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-text-muted text-lg">
        Carregando estoque...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl text-primary m-0">Estoque - Pronta Entrega</h2>
          <p className="text-sm text-text-muted mt-1">
            {estoque.length} item(ns) em estoque
          </p>
        </div>
        <button
          className="px-3 py-2 text-sm font-semibold bg-accent/10 text-accent rounded-md cursor-pointer hover:bg-accent/20 transition-colors"
          onClick={loadEstoque}
        >
          ↻ Atualizar
        </button>
      </div>

      {/* Empty warning */}
      {estoque.length === 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-yellow-800 text-sm font-medium">
            ⚠️ Nenhum item em estoque. Adicione camisas disponíveis para pronta
            entrega usando o formulário abaixo.
          </p>
        </div>
      )}

      {/* Current stock grouped by product */}
      {grouped.size > 0 && (
        <div className="mb-8 space-y-4">
          {Array.from(grouped.entries()).map(([produtoId, items]) => {
            const first = items[0];
            const totalQty = items.reduce((s, i) => s + i.quantidade, 0);
            const imgs = parseImageUrls(
              first.produto_imagem ? [first.produto_imagem] : []
            );
            const imgSrc =
              imgs.length > 0
                ? getCachedImageUrl(imgs[0], null, 0, "small")
                : "";

            return (
              <div
                key={produtoId}
                className="bg-card-bg rounded-md border border-border overflow-hidden"
              >
                {/* Product header */}
                <div className="flex items-center gap-3 p-3 border-b border-border bg-bg-base">
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={first.produto_nome ?? ""}
                      width={40}
                      height={40}
                      className="w-10 h-10 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-text-muted text-xs flex-shrink-0">
                      —
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {first.produto_nome}
                    </div>
                    <div className="text-xs text-text-muted">
                      {first.produto_tipo}
                      {first.produto_time ? ` • ${first.produto_time}` : ""}
                      {first.produto_temporada
                        ? ` • ${first.produto_temporada}`
                        : ""}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-text-muted whitespace-nowrap">
                    {totalQty} unidade{totalQty !== 1 ? "s" : ""}
                  </div>
                </div>

                {/* Sizes / rows */}
                <div>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0 hover:bg-bg-base/50 transition-colors"
                    >
                      <span className="text-sm font-semibold w-10">
                        {item.tamanho}
                        {item.personalizado && <span className="text-[10px] text-accent ml-0.5">★</span>}
                      </span>
                      <div className="flex-1">
                        {editingId === item.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={editQuantidade}
                              onChange={(e) => setEditQuantidade(e.target.value)}
                              onBlur={() => saveEdit(item.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(item.id);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              className="w-20 px-2 py-1 border border-border rounded-md bg-card-bg text-sm text-center"
                              autoFocus
                            />
                            <span className="text-xs text-text-muted">
                              Enter para salvar, Esc para cancelar
                            </span>
                          </div>
                        ) : (
                          <button
                            className="text-sm font-medium text-text-main hover:text-accent transition-colors cursor-pointer bg-transparent border-none"
                            onClick={() => startEdit(item)}
                            title="Clique para editar quantidade"
                          >
                            Quantidade:{" "}
                            <span className="font-bold">{item.quantidade}</span>
                          </button>
                        )}
                      </div>
                      {item.personalizado && item.nome_personalizado && (
                        <span className="text-xs text-accent ml-2">
                          {item.nome_personalizado} #{item.numero_personalizado}
                        </span>
                      )}
                      <button
                        className="px-2.5 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => {
                          setVendaItem(item);
                          setVendaNomeCliente("");
                          setShowVendaDireta(true);
                        }}
                        disabled={item.quantidade <= 0}
                        title="Registrar venda direta (boca a boca)"
                      >
                        Vender
                      </button>
                      <button
                        className="px-2.5 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => handleDelete(item.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Item Form */}
      <div className="border-t border-border pt-6">
        <h3 className="text-lg font-semibold text-primary mb-2">
          Adicionar ao Estoque
        </h3>
        <p className="text-sm text-text-muted mb-4">
          Pesquise o produto pelo nome para adicionar ao estoque de pronta entrega.
          Use quando uma camisa ficou disponível (ex: troca de tamanho, sobra de pedido).
        </p>

        {/* Search input */}
        <div className="mb-4">
          <input
            type="text"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              // Deselect product if search changes
              if (selectedProdutoId) {
                setSelectedProdutoId("");
                setSizeQuantities({});
              }
            }}
            placeholder="Buscar produto por nome, time, liga..."
            className="w-full px-3 py-2.5 border border-border rounded-md bg-card-bg text-sm"
            autoFocus
          />
        </div>

        {/* Search results — clickable product cards */}
        {busca.trim() && !selectedProdutoId && (
          <div className="mb-4">
            {resultados.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">
                Nenhum produto encontrado para "{busca}".
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {resultados.map((p) => {
                  const imgs = parseImageUrls(p.imagem_urls);
                  const img = imgs.length > 0 ? getCachedImageUrl(imgs[0], p.cached_image_urls, 0, "small") : "";
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProdutoId(p.id);
                        setBusca(p.nome);
                      }}
                      className="flex items-center gap-3 p-2.5 bg-card-bg rounded-md border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors cursor-pointer text-left w-full"
                    >
                      {img ? (
                        <img
                          src={img}
                          alt={p.nome}
                          width={40}
                          height={40}
                          className="w-10 h-10 object-cover rounded flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-text-muted text-xs flex-shrink-0">
                          —
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p.nome}</div>
                        <div className="text-xs text-text-muted">
                          {p.tipo} • {p.time || p.liga} • {p.temporada}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800 text-sm font-medium">✓ {successMessage}</p>
          </div>
        )}

        {/* Selected product detail — multi-size quantity form */}
        {selectedProduto && (
          <div className="p-4 bg-accent/5 border border-accent/20 rounded-md mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{selectedProduto.nome}</div>
                <div className="text-xs text-text-muted">
                  {selectedProduto.tipo} • {selectedProduto.time || selectedProduto.liga} • {selectedProduto.temporada}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedProdutoId("");
                  setSizeQuantities({});
                  setBusca("");
                }}
                className="text-text-muted hover:text-red-500 text-lg cursor-pointer bg-transparent border-none ml-2"
                title="Trocar produto"
              >
                ✕
              </button>
            </div>

            {/* Size quantity rows */}
            {tamanhosDisponiveis.length > 0 && (
              <div className="space-y-2 mb-4">
                {tamanhosDisponiveis.map((t) => {
                  const qty = sizeQuantities[t] ?? 0;
                  return (
                    <div
                      key={t}
                      className="flex items-center gap-3 py-1.5"
                    >
                      <span className="text-sm font-semibold w-10">{t}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSizeQuantities((prev) => ({
                              ...prev,
                              [t]: Math.max(0, (prev[t] ?? 0) - 1),
                            }))
                          }
                          className="w-7 h-7 flex items-center justify-center text-sm font-bold bg-gray-100 border border-border rounded-md cursor-pointer hover:bg-gray-200 transition-colors"
                          disabled={qty <= 0}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={qty}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setSizeQuantities((prev) => ({
                              ...prev,
                              [t]: isNaN(v) || v < 0 ? 0 : v,
                            }));
                          }}
                          className="w-16 px-2 py-1 border border-border rounded-md bg-card-bg text-sm text-center"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSizeQuantities((prev) => ({
                              ...prev,
                              [t]: (prev[t] ?? 0) + 1,
                            }))
                          }
                          className="w-7 h-7 flex items-center justify-center text-sm font-bold bg-gray-100 border border-border rounded-md cursor-pointer hover:bg-gray-200 transition-colors"
                        >
                          +
                        </button>
                      </div>
                      {/* Quick-fill buttons for common quantities */}
                      <div className="flex gap-1">
                        {[1, 2, 3, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              setSizeQuantities((prev) => ({
                                ...prev,
                                [t]: (prev[t] ?? 0) + n,
                              }))
                            }
                            className="px-2 py-0.5 text-xs font-medium bg-gray-50 border border-border rounded cursor-pointer hover:bg-gray-100 transition-colors"
                          >
                            +{n}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tamanhosDisponiveis.length === 0 && (
              <p className="text-sm text-text-muted mb-4">
                Nenhum tamanho disponível para este tipo de produto.
              </p>
            )}

            {/* Personalization */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <input
                  id="personalizado-check"
                  type="checkbox"
                  checked={personalizado}
                  onChange={(e) => {
                    setPersonalizado(e.target.checked);
                    if (!e.target.checked) {
                      setNomePersonalizado("");
                      setNumeroPersonalizado("");
                    }
                  }}
                  className="w-4 h-4 accent-primary cursor-pointer"
                  disabled={semPersonalizacao}
                />
                <label htmlFor="personalizado-check" className="text-sm font-medium cursor-pointer select-none">
                  Personalizado (nome e número)
                </label>
              </div>
              {personalizado && !semPersonalizacao && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={nomePersonalizado}
                    onChange={(e) => setNomePersonalizado(e.target.value.toUpperCase())}
                    placeholder="Nome (ex: SILVA)"
                    maxLength={15}
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
                  />
                  <input
                    type="text"
                    value={numeroPersonalizado}
                    onChange={(e) => setNumeroPersonalizado(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Número (ex: 10)"
                    maxLength={2}
                    className="w-24 px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
                  />
                </div>
              )}
              {semPersonalizacao && (
                <p className="text-xs text-text-muted mt-1">
                  Personalização não disponível para este tipo de produto.
                </p>
              )}
            </div>

            {/* Feminino */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <input
                  id="feminino-check"
                  type="checkbox"
                  checked={feminino}
                  onChange={(e) => setFeminino(e.target.checked)}
                  className="w-4 h-4 accent-pink-500 cursor-pointer"
                />
                <label htmlFor="feminino-check" className="text-sm font-medium cursor-pointer select-none">
                  Feminino
                </label>
              </div>
            </div>

            {/* Add button */}
            {tamanhosDisponiveis.length > 0 && (
              <div className="flex items-center justify-between">
                <button
                  onClick={handleAdd}
                  disabled={saving || Object.values(sizeQuantities).every((v) => !v)}
                  className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-md cursor-pointer hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving
                    ? "Adicionando..."
                    : `Adicionar ao Estoque (${
                        Object.entries(sizeQuantities)
                          .filter(([, v]) => v > 0)
                          .reduce((s, [, v]) => s + v, 0)
                      } un)`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSizeQuantities(
                      Object.fromEntries(tamanhosDisponiveis.map((t) => [t, 0]))
                    );
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-red-500 bg-transparent border border-border rounded-md cursor-pointer hover:border-red-300 transition-colors"
                >
                  Limpar
                </button>
              </div>
            )}
            <p className="text-xs text-text-muted mt-2">
              Se já existir no estoque, a quantidade será somada.
            </p>
          </div>
        )}
      </div>

      {/* Venda Direta Modal */}
      {showVendaDireta && vendaItem && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4"
          onClick={() => { setShowVendaDireta(false); setVendaItem(null); }}
        >
          <div
            className="bg-card-bg rounded-md p-6 max-w-sm w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 text-text-muted hover:text-primary cursor-pointer bg-transparent border-none text-xl leading-none p-1"
              onClick={() => { setShowVendaDireta(false); setVendaItem(null); }}
            >
              ✕
            </button>

            <h3 className="mb-4 text-primary font-semibold text-lg">💰 Venda Direta</h3>

            <div className="mb-4 p-3 bg-bg-base rounded-md">
              <div className="font-semibold text-sm">{vendaItem.produto_nome}</div>
              <div className="text-xs text-text-muted mt-1">
                Tamanho: <strong>{vendaItem.tamanho}</strong> • Disponível: <strong>{vendaItem.quantidade}</strong>
              </div>
              {vendaItem.personalizado && vendaItem.nome_personalizado && (
                <div className="text-xs text-accent font-semibold mt-1">
                  ✦ {vendaItem.nome_personalizado} #{vendaItem.numero_personalizado}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-text-muted mb-2">Nome do cliente</label>
              <input
                type="text"
                value={vendaNomeCliente}
                onChange={(e) => setVendaNomeCliente(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                autoFocus
              />
            </div>

            <p className="text-xs text-text-muted mb-4">
              Isso registra um pedido como entregue, desconta 1 unidade do estoque e aparece no histórico de vendas.
            </p>

            <button
              className="w-full py-2.5 text-sm font-semibold bg-green-600 text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleVendaDireta}
              disabled={vendaSaving || !vendaNomeCliente.trim()}
            >
              {vendaSaving ? "Registrando..." : "Confirmar Venda"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
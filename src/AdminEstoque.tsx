import { useState, useEffect, useMemo } from "react";
import type { DbProduto } from "./lib/db";
import { getEstoque, addEstoqueItem, updateEstoqueItem, deleteEstoqueItem } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import { getCachedImageUrl } from "./types";
import { TAMANHOS_POR_TIPO } from "./types";
import { buscaPorPalavras } from "./lib/utils";
import type { EstoqueItem } from "./types";

interface AdminEstoqueProps {
  produtos: DbProduto[];
}

export default function AdminEstoque({ produtos }: AdminEstoqueProps) {
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add form state
  const [busca, setBusca] = useState("");
  const [selectedProdutoId, setSelectedProdutoId] = useState("");
  const [selectedTamanho, setSelectedTamanho] = useState("");
  const [quantidade, setQuantidade] = useState(1);

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

  // Filtered products for the add form search
  const resultados = useMemo(() => {
    if (!busca.trim()) return produtos.slice(0, 30);
    return produtos.filter((p) => {
      const campos = [p.nome, p.time, p.tipo, p.liga, p.temporada].join(" ");
      return buscaPorPalavras(busca, campos);
    }).slice(0, 30);
  }, [produtos, busca]);

  const selectedProduto = useMemo(
    () => produtos.find((p) => p.id === selectedProdutoId),
    [produtos, selectedProdutoId]
  );

  const tamanhosDisponiveis = selectedProduto
    ? TAMANHOS_POR_TIPO[selectedProduto.tipo] ?? []
    : [];

  // Reset size when product changes
  useEffect(() => {
    setSelectedTamanho("");
  }, [selectedProdutoId]);

  async function handleAdd() {
    if (!selectedProdutoId || !selectedTamanho || quantidade < 1) return;
    setSaving(true);
    try {
      const added = await addEstoqueItem(selectedProdutoId, selectedTamanho, quantidade);
      // Replace or append in local state
      setEstoque((prev) => {
        const idx = prev.findIndex(
          (e) => e.produto_id === selectedProdutoId && e.tamanho === selectedTamanho
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = added;
          return next;
        }
        return [added, ...prev];
      });
      // Reset form
      setSelectedProdutoId("");
      setSelectedTamanho("");
      setQuantidade(1);
      setBusca("");
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
        <h3 className="text-lg font-semibold text-primary mb-4">
          Adicionar ao Estoque
        </h3>

        {/* Search */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-muted mb-1">
            Buscar produto no catálogo
          </label>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Digite para buscar por nome, time, tipo..."
            className="w-full px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
          />
        </div>

        {/* Product dropdown */}
        {busca && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-text-muted mb-1">
              Produto
            </label>
            {resultados.length === 0 ? (
              <p className="text-xs text-text-muted">
                Nenhum produto encontrado.
              </p>
            ) : (
              <select
                value={selectedProdutoId}
                onChange={(e) => setSelectedProdutoId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
              >
                <option value="">Selecione um produto...</option>
                {resultados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.tipo} ({p.time ?? p.liga})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Size selector */}
        {selectedProdutoId && tamanhosDisponiveis.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-text-muted mb-1">
              Tamanho
            </label>
            <div className="flex flex-wrap gap-2">
              {tamanhosDisponiveis.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTamanho(t)}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-md border transition-colors cursor-pointer ${
                    selectedTamanho === t
                      ? "bg-primary text-white border-primary"
                      : "bg-card-bg text-text-main border-border hover:border-accent/40"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quantity */}
        {selectedProdutoId && selectedTamanho && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-text-muted mb-1">
              Quantidade
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 px-3 py-2 border border-border rounded-md bg-card-bg text-sm text-center"
              />
              <button
                onClick={handleAdd}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-md cursor-pointer hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Adicionando..." : "Adicionar"}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Se o produto e tamanho já existirem no estoque, a quantidade será
              atualizada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

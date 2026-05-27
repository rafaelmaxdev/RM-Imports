import { useState, useMemo, useCallback, useRef } from "react";
import type { DbProduto } from "./lib/db";
import { toggleDestaque, reorderDestaques } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import { proxyImageUrl } from "./types";

interface AdminDestaquesProps {
  produtos: DbProduto[];
  setProdutos: React.Dispatch<React.SetStateAction<DbProduto[]>>;
}

export default function AdminDestaques({ produtos, setProdutos }: AdminDestaquesProps) {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const reorderRef = useRef(0);

  // Normalize ordem_destaque: assign sequential values to nulls, sort by ordem
  const destaques = useMemo(() => {
    const items = produtos.filter((p) => p.destaque);
    // Sort by existing ordem_destaque, nulls last; within nulls, preserve array order
    items.sort((a, b) => {
      const aOrdem = a.ordem_destaque;
      const bOrdem = b.ordem_destaque;
      if (aOrdem === null && bOrdem === null) return 0;
      if (aOrdem === null) return 1;
      if (bOrdem === null) return -1;
      return aOrdem - bOrdem;
    });
    return items;
  }, [produtos]);

  const resultados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return produtos.filter((p) => {
      if (p.destaque) return false;
      if (filtroTipo && p.tipo !== filtroTipo) return false;
      if (q) {
        const campos = [p.nome, p.time, p.tipo, p.temporada].join(" ").toLowerCase();
        if (!campos.includes(q)) return false;
      }
      return true;
    }).slice(0, 20);
  }, [produtos, busca, filtroTipo]);

  async function handleToggle(id: string, destaque: boolean) {
    setSaving(id);
    try {
      await toggleDestaque(id, destaque);
      if (destaque) {
        // Adding: assign next ordem_destaque
        const maxOrdem = destaques.reduce(
          (max, p) => Math.max(max, p.ordem_destaque ?? 0),
          0
        );
        const newOrdem = maxOrdem + 1;
        setProdutos((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, destaque, ordem_destaque: newOrdem } : p
          )
        );
        await reorderDestaques([{ id, ordem_destaque: newOrdem }]);
      } else {
        // Removing: re-index remaining items
        const remaining = destaques.filter((p) => p.id !== id);
        const updates = remaining.map((p, i) => ({
          id: p.id,
          ordem_destaque: i + 1,
        }));
        setProdutos((prev) =>
          prev.map((p) => {
            if (p.id === id) return { ...p, destaque, ordem_destaque: null };
            const update = updates.find((u) => u.id === p.id);
            if (update) return { ...p, ordem_destaque: update.ordem_destaque };
            return p;
          })
        );
        await reorderDestaques(updates);
      }
    } catch (err) {
      console.error("Erro ao atualizar destaque:", err);
    } finally {
      setSaving(null);
    }
  }

  const handleMove = useCallback(
    async (index: number, direction: "up" | "down") => {
      if (direction === "up" && index === 0) return;
      if (direction === "down" && index === destaques.length - 1) return;

      const swapIndex = direction === "up" ? index - 1 : index + 1;

      // Build new order: swap the two items, then re-index all
      const newOrder = [...destaques];
      [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];

      // Assign sequential ordem_destaque to all items
      const updates = newOrder.map((p, i) => ({
        id: p.id,
        ordem_destaque: i + 1,
      }));

      // Optimistic local update
      const updateMap = new Map(updates.map((u) => [u.id, u.ordem_destaque]));
      setProdutos((prev) =>
        prev.map((p) => {
          const newOrdem = updateMap.get(p.id);
          if (newOrdem !== undefined) return { ...p, ordem_destaque: newOrdem };
          return p;
        })
      );

      // Debounce persist: only send the latest reorder
      const opId = ++reorderRef.current;
      try {
        await reorderDestaques(updates);
      } catch (err) {
        if (reorderRef.current === opId) {
          console.error("Erro ao reordenar destaque:", err);
        }
      }
    },
    [destaques, setProdutos]
  );

  return (
    <div>
      <h3 className="text-xl mb-4 text-primary">Destaques</h3>

      {/* Current destaques */}
      {destaques.length > 0 ? (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-text-muted mb-2">
            Produtos em destaque ({destaques.length})
          </h4>
          <div className="flex flex-col gap-2">
            {destaques.map((p, index) => {
              const imgs = parseImageUrls(p.imagem_urls);
              const img = imgs.length > 0 ? proxyImageUrl(imgs[0].replace(/\/(small|medium|large)\.jpg$/i, "/small.jpg")) : "";
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 p-2 bg-card-bg rounded-md border border-border"
                >
                  {/* Up/Down arrows */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      className="px-1 py-0.5 text-xs text-text-muted hover:text-text-main cursor-pointer disabled:opacity-30 disabled:cursor-default"
                      onClick={() => handleMove(index, "up")}
                      disabled={index === 0 || saving !== null}
                      title="Mover para cima"
                    >
                      ▲
                    </button>
                    <button
                      className="px-1 py-0.5 text-xs text-text-muted hover:text-text-main cursor-pointer disabled:opacity-30 disabled:cursor-default"
                      onClick={() => handleMove(index, "down")}
                      disabled={index === destaques.length - 1 || saving !== null}
                      title="Mover para baixo"
                    >
                      ▼
                    </button>
                  </div>
                  {img ? (
                    <img src={img} alt={p.nome} className="w-10 h-10 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-text-muted text-xs">
                      —
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.nome}</div>
                    <div className="text-xs text-text-muted">
                      {p.tipo} • {p.temporada}
                    </div>
                  </div>
                  <button
                    className="px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                    onClick={() => handleToggle(p.id, false)}
                    disabled={saving === p.id}
                  >
                    Remover
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-text-muted text-sm mb-6">
          Nenhum produto em destaque. Use a busca abaixo para adicionar.
        </p>
      )}

      {/* Search to add */}
      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold text-text-muted mb-2">
          Adicionar ao destaque
        </h4>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, time..."
            className="flex-1 px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
          />
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
          >
            <option value="">Todos os tipos</option>
            {["Torcedor", "Jogador", "Manga Longa Torcedor", "Manga Longa Jogador", "Manga Longa Retrô", "Retrô"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {busca || filtroTipo ? (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {resultados.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-4">
                Nenhum produto encontrado.
              </p>
            ) : (
              resultados.map((p) => {
                const imgs = parseImageUrls(p.imagem_urls);
                const img = imgs.length > 0 ? proxyImageUrl(imgs[0].replace(/\/(small|medium|large)\.jpg$/i, "/small.jpg")) : "";
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-2 bg-card-bg rounded-md border border-border"
                  >
                    {img ? (
                      <img src={img} alt={p.nome} className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-text-muted text-xs">
                        —
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{p.nome}</div>
                      <div className="text-xs text-text-muted">
                        {p.tipo} • {p.temporada}
                      </div>
                    </div>
                    <button
                      className="px-3 py-1.5 text-xs font-semibold bg-green-500 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                      onClick={() => handleToggle(p.id, true)}
                      disabled={saving === p.id}
                    >
                      Adicionar
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <p className="text-text-muted text-sm text-center py-4">
            Digite algo para buscar produtos.
          </p>
        )}
      </div>
    </div>
  );
}
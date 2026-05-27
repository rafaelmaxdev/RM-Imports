import { useState, useMemo } from "react";
import type { DbProduto } from "./lib/db";
import { toggleDestaque } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import { proxyImageUrl } from "./types";

interface AdminDestaquesProps {
  produtos: DbProduto[];
  setProdutos: React.Dispatch<React.SetStateAction<DbProduto[]>>;
}

export default function AdminDestaques({ produtos, setProdutos }: AdminDestaquesProps) {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [ordenacao, setOrdenacao] = useState<"time" | "temporada-asc" | "temporada-desc">("time");
  const [saving, setSaving] = useState<string | null>(null);

  const destaques = useMemo(() => {
    const res = produtos.filter((p) => p.destaque);
    switch (ordenacao) {
      case "time":
        res.sort((a, b) => a.time.localeCompare(b.time) || a.nome.localeCompare(b.nome));
        break;
      case "temporada-asc":
        res.sort((a, b) => a.temporada.localeCompare(b.temporada) || a.time.localeCompare(b.time));
        break;
      case "temporada-desc":
        res.sort((a, b) => b.temporada.localeCompare(a.temporada) || a.time.localeCompare(b.time));
        break;
    }
    return res;
  }, [produtos, ordenacao]);

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
      setProdutos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, destaque } : p))
      );
    } catch (err) {
      console.error("Erro ao atualizar destaque:", err);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <h3 className="text-xl mb-4 text-primary">Destaques</h3>

      {/* Current destaques */}
      {destaques.length > 0 ? (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-text-muted">
              Produtos em destaque ({destaques.length})
            </h4>
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as typeof ordenacao)}
              className="px-2 py-1 border border-border rounded-md bg-card-bg text-xs"
            >
              <option value="time">Time / Nome</option>
              <option value="temporada-asc">Temp. mais antiga</option>
              <option value="temporada-desc">Temp. mais recente</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            {destaques.map((p) => {
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
            placeholder="Buscar por nome, time, liga..."
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
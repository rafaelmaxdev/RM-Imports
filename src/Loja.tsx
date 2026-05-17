import { useState, useMemo } from "react";
import type { DbProduto } from "./lib/db";
import CartModal from "./CartModal";
import { formatarMoeda, PRECOS_BASE, proxyImageUrl } from "./types";

const CATEGORIAS = [
  "Todas",
  "Brasileirão",
  "Bundesliga",
  "Eredivisie",
  "La Liga",
  "Ligue 1",
  "MLS",
  "Premier League",
  "Serie A",
  "Seleções",
].sort((a, b) => a === "Todas" ? -1 : b === "Todas" ? 1 : a.localeCompare(b));

const renomear: Record<string, string> = {
  "Ceara Sporting": "Ceará",
  "Ceará Sporting": "Ceará",
};

function normalizeNome(nome: string): string {
  let result = nome;
  Object.entries(renomear).forEach(([de, para]) => {
    result = result.replace(de, para);
  });
  return result;
}

export default function Loja({ produtos }: { produtos: DbProduto[] }) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Todas");
  const [filtroTime, setFiltroTime] = useState("");
  const [produtoSelecionado, setProdutoSelecionado] = useState<DbProduto | null>(null);

  const produtosFiltrados = useMemo(() => {
    let res = produtos.map((p) => ({
      ...p,
      nome: normalizeNome(p.nome),
      time: normalizeNome(p.time),
      liga: normalizeNome(p.liga),
    }));
    if (categoriaSelecionada !== "Todas") {
      res = res.filter((p) => p.liga === categoriaSelecionada);
    }
    if (filtroTime) {
      res = res.filter((p) => p.time === filtroTime);
    }
    return res;
  }, [produtos, categoriaSelecionada, filtroTime]);

  const timesDisponiveis = useMemo(() => {
    const times = produtosFiltrados.map((p) => p.time);
    return Array.from(new Set(times)).sort((a, b) => a.localeCompare(b));
  }, [produtosFiltrados]);

  return (
    <div className="loja-container">
      <header className="loja-header">
        <h1>RM Imports</h1>
        <p>As melhores camisas de futebol</p>
      </header>

      <nav className="categoria-menu">
        {CATEGORIAS.map((cat) => (
          <button
            key={cat}
            className={`cat-btn ${categoriaSelecionada === cat ? "active" : ""}`}
            onClick={() => {
              setCategoriaSelecionada(cat);
              setFiltroTime("");
            }}
          >
            {cat}
          </button>
        ))}
      </nav>

      {timesDisponiveis.length > 0 && (
        <div className="filtros-loja">
          <select value={filtroTime} onChange={(e) => setFiltroTime(e.target.value)}>
            <option value="">Todos os times</option>
            {timesDisponiveis.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {produtosFiltrados.length === 0 ? (
        <div className="loja-empty">
          <p>Nenhum produto disponível nesta categoria.</p>
        </div>
      ) : (
        <div className="produtos-grid">
          {produtosFiltrados.map((p) => (
            <div key={p.id} className="produto-card-store">
              <div className="produto-img-wrap">
                <img
                  className="produto-img-store"
                  src={
                    proxyImageUrl(p.imagem_url) ||
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3ESem imagem%3C/text%3E%3C/svg%3E"
                  }
                  alt={p.nome}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3EErro%3C/text%3E%3C/svg%3E";
                  }}
                />
              </div>
              <div className="produto-info-store">
                <div className="produto-nome-store">{p.nome}</div>
                <div className="produto-tags">
                  <span className="tag">{p.tipo}</span>
                  <span className="tag">{p.temporada}</span>
                </div>
                <div className="produto-preco">{formatarMoeda(PRECOS_BASE[p.tipo] || 89.90)}</div>
                <button
                  className="btn btn-add btn-add-cart"
                  onClick={() => setProdutoSelecionado(p)}
                >
                  Adicionar ao Carrinho
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {produtoSelecionado && (
        <CartModal
          produto={produtoSelecionado}
          onClose={() => setProdutoSelecionado(null)}
        />
      )}
    </div>
  );
}

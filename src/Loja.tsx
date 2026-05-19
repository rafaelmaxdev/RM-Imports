import { useState, useMemo, useEffect } from "react";
import type { DbProduto } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import CartModal from "./CartModal";
import ImageCarousel from "./ImageCarousel";
import { formatarMoeda, PRECOS_BASE } from "./types";

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
].sort((a, b) => (a === "Todas" ? -1 : b === "Todas" ? 1 : a.localeCompare(b)));

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
  const [toastVisible, setToastVisible] = useState(false);
  const [toastProduto, setToastProduto] = useState("");

  useEffect(() => {
    if (toastVisible) {
      const timer = setTimeout(() => setToastVisible(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastVisible]);

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
    let res = produtos.map((p) => ({
      ...p,
      nome: normalizeNome(p.nome),
      time: normalizeNome(p.time),
      liga: normalizeNome(p.liga),
    }));
    if (categoriaSelecionada !== "Todas") {
      res = res.filter((p) => p.liga === categoriaSelecionada);
    }
    const times = res.map((p) => p.time);
    return Array.from(new Set(times)).sort((a, b) => a.localeCompare(b));
  }, [produtos, categoriaSelecionada]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="text-center mb-6">
        <h1 className="text-3xl font-extrabold text-primary tracking-tight">RM Imports</h1>
        <p className="text-text-muted mt-1">As melhores camisas de futebol</p>
      </header>

      <nav className="flex justify-center gap-2 flex-wrap pb-2 mb-4">
        {CATEGORIAS.map((cat) => (
          <button
            key={cat}
            className={`px-4 py-2 border border-border bg-card-bg rounded-full cursor-pointer whitespace-nowrap text-sm transition-colors ${
              categoriaSelecionada === cat
                ? "bg-primary text-white border-primary"
                : "text-text-main hover:bg-gray-100"
            }`}
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
        <div className="mb-6">
          <select
            value={filtroTime}
            onChange={(e) => setFiltroTime(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-card-bg text-sm min-w-50"
          >
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
        <div className="text-center py-16 text-text-muted">
          <p>Nenhum produto disponível nesta categoria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6 items-stretch">
          {produtosFiltrados.map((p) => (
            <div
              key={p.id}
              className="bg-card-bg rounded-md overflow-hidden shadow-card hover:-translate-y-1 hover:shadow-card-hover transition-all cursor-default flex flex-col h-full"
            >
              <div className="aspect-square bg-gray-100 overflow-hidden">
                <ImageCarousel
                  images={parseImageUrls(p.imagem_urls).map((url) =>
                    url.startsWith("data:") ? url : url.replace(/\/(small|medium|large)\.jpg$/i, "/small.jpg")
                  )}
                  alt={p.nome}
                />
              </div>

              <div className="p-4 flex flex-col flex-1">
                <div className="font-semibold text-[0.95rem] mb-2 line-clamp-2">
                  {p.nome}
                </div>

                <div className="flex gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 bg-primary text-white rounded">
                    {p.tipo}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-primary text-white rounded">
                    {p.temporada}
                  </span>
                </div>

                <div className="font-bold text-lg text-accent mt-auto">
                  {formatarMoeda(PRECOS_BASE[p.tipo] || 89.90)}
                </div>

                <button
                  className="w-full py-3 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 mt-3 flex-shrink-0 h-11 flex items-center justify-center"
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
          onAdded={(nome) => {
            setToastProduto(nome);
            setToastVisible(true);
          }}
        />
      )}

      <div
        className={`fixed bottom-8 left-1/2 bg-primary text-white px-6 py-3 rounded-md shadow-lg text-sm font-semibold z-[2000] pointer-events-none transition-all duration-300 ${
          toastVisible ? "animate-toast opacity-100" : "opacity-0 translate-y-25"
        }`}
      >
        ✓ {toastProduto} adicionado ao carrinho
      </div>
    </div>
  );
}

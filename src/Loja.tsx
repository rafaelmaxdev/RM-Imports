import { useState, useMemo, useEffect } from "react";
import type { DbProduto } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import CartModal from "./CartModal";
import ImageCarousel from "./ImageCarousel";
import ImageLightbox from "./ImageLightbox";
import DestaqueCarousel from "./DestaqueCarousel";
import type { LojaConfig, PromocaoTipo } from "./types";
import { formatarMoeda, getPrecoProduto } from "./types";

const CATEGORIAS = [
  "Todas",
  "Brasileirão",
  "Bundesliga",
  "Eredivisie",
  "La Liga",
  "Ligue 1",
  "MLS",
  "NBA",
  "Premier League",
  "Serie A",
  "Seleções",
].sort((a, b) => (a === "Todas" ? -1 : b === "Todas" ? 1 : a.localeCompare(b)));

const renomear: Record<string, string> = {
  "Inter Milan": "Inter de Milão",
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

type Ordenacao = "time" | "preco-asc" | "preco-desc" | "categoria";

export default function Loja({ produtos, config }: { produtos: DbProduto[]; config: LojaConfig }) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Todas");
  const [filtroTime, setFiltroTime] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("time");
  const [produtoSelecionado, setProdutoSelecionado] = useState<DbProduto | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastProduto, setToastProduto] = useState("");
  const [visibleCount, setVisibleCount] = useState(24);
  const [lightbox, setLightbox] = useState<{ images: string[]; alt: string; index: number } | null>(null);

  useEffect(() => {
    setVisibleCount(24);
  }, [categoriaSelecionada, filtroTime, filtroTipo]);

  useEffect(() => {
    if (toastVisible) {
      const timer = setTimeout(() => setToastVisible(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastVisible]);

  const produtosNormalizados = useMemo(() => {
    return produtos.map((p) => ({
      ...p,
      nome: normalizeNome(p.nome),
      time: normalizeNome(p.time),
      liga: normalizeNome(p.liga),
    }));
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    let res = [...produtosNormalizados];
    if (categoriaSelecionada !== "Todas") {
      res = res.filter((p) => p.liga === categoriaSelecionada);
    }
    if (filtroTime) {
      res = res.filter((p) => p.time === filtroTime);
    }
    if (filtroTipo) {
      res = res.filter((p) => p.tipo === filtroTipo);
    }

    // Sort
    switch (ordenacao) {
      case "time":
        res.sort((a, b) => a.time.localeCompare(b.time) || a.nome.localeCompare(b.nome));
        break;
      case "preco-asc": {
        res.sort((a, b) => {
          const priceA = getPrecoProduto(a.tipo, config, a.preco_customizado, (a.promocao_tipo as PromocaoTipo) ?? undefined, a.promocao_valor);
          const priceB = getPrecoProduto(b.tipo, config, b.preco_customizado, (b.promocao_tipo as PromocaoTipo) ?? undefined, b.promocao_valor);
          const valA = priceA.promo ?? priceA.base;
          const valB = priceB.promo ?? priceB.base;
          return valA - valB;
        });
        break;
      }
      case "preco-desc": {
        res.sort((a, b) => {
          const priceA = getPrecoProduto(a.tipo, config, a.preco_customizado, (a.promocao_tipo as PromocaoTipo) ?? undefined, a.promocao_valor);
          const priceB = getPrecoProduto(b.tipo, config, b.preco_customizado, (b.promocao_tipo as PromocaoTipo) ?? undefined, b.promocao_valor);
          const valA = priceA.promo ?? priceA.base;
          const valB = priceB.promo ?? priceB.base;
          return valB - valA;
        });
        break;
      }
      case "categoria":
        res.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.time.localeCompare(b.time) || a.nome.localeCompare(b.nome));
        break;
    }

    return res;
  }, [produtosNormalizados, categoriaSelecionada, filtroTime, filtroTipo, ordenacao, config]);

  const timesDisponiveis = useMemo(() => {
    let res = [...produtosNormalizados];
    if (categoriaSelecionada !== "Todas") {
      res = res.filter((p) => p.liga === categoriaSelecionada);
    }
    const times = res.map((p) => p.time);
    return Array.from(new Set(times)).sort((a, b) => a.localeCompare(b));
  }, [produtosNormalizados, categoriaSelecionada]);

  const tiposDisponiveis = useMemo(() => {
    let res = [...produtosNormalizados];
    if (categoriaSelecionada !== "Todas") {
      res = res.filter((p) => p.liga === categoriaSelecionada);
    }
    if (filtroTime) {
      res = res.filter((p) => p.time === filtroTime);
    }
    const tipos = res.map((p) => p.tipo);
    return Array.from(new Set(tipos)).sort();
  }, [produtosNormalizados, categoriaSelecionada, filtroTime]);

  const destaquesEPromos = useMemo(() => {
    return produtos.filter((p) => p.destaque || (p.promocao && p.promocao_tipo));
  }, [produtos]);

  return (
    <>
      {/* Destaques & Promoções carousel — full width */}
      {destaquesEPromos.length > 0 && (
        <DestaqueCarousel
          produtos={destaquesEPromos}
          config={config}
          onSelect={(p) => setProdutoSelecionado(p)}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 pt-4 pb-8">
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
              setFiltroTipo("");
            }}
          >
            {cat}
          </button>
        ))}
      </nav>

      <div className="flex gap-2 mb-6 flex-wrap items-center">
        {timesDisponiveis.length > 0 && (
          <select
            value={filtroTime}
            onChange={(e) => setFiltroTime(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-card-bg text-sm min-w-44"
          >
            <option value="">Todos os times</option>
            {timesDisponiveis.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}

        {tiposDisponiveis.length > 0 && (
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-card-bg text-sm min-w-44"
          >
            <option value="">Todos os tipos</option>
            {tiposDisponiveis.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}

        <select
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
          className="px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
        >
          <option value="time">Ordenar: Time / Nome</option>
          <option value="preco-asc">Menor preço</option>
          <option value="preco-desc">Maior preço</option>
          <option value="categoria">Categoria</option>
        </select>

        {(filtroTime || filtroTipo) && (
          <button
            className="px-3 py-2 text-sm bg-text-muted text-white rounded-md cursor-pointer hover:opacity-90"
            onClick={() => { setFiltroTime(""); setFiltroTipo(""); }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {produtosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <p className="text-4xl mb-4">🚧</p>
          <p className="text-lg font-semibold text-primary mb-2">Em breve!</p>
          <p>Estamos preparando novidades para esta categoria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 sm:gap-6 items-stretch">
          {produtosFiltrados.slice(0, visibleCount).map((p) => {
            const priceInfo = getPrecoProduto(p.tipo, config, p.preco_customizado, (p.promocao_tipo as PromocaoTipo) ?? undefined, p.promocao_valor);
            const { base, promo, emPromocao, badge, discountLabel } = priceInfo;

            return (
              <div
                key={p.id}
                className="bg-card-bg rounded-lg overflow-hidden shadow-card border border-border hover:-translate-y-1 hover:shadow-card-hover hover:border-accent/20 transition-all duration-300 ease-out cursor-default flex flex-col h-full relative"
              >
                {/* Promo/destaque tags */}
                {emPromocao && (
                  <span className="animate-promo-pulse absolute top-1.5 right-1.5 sm:top-2 sm:right-2 bg-accent text-white text-[9px] sm:text-[10px] font-extrabold px-1.5 sm:px-2 py-0.5 rounded-sm shadow-md uppercase tracking-wider z-10">
                    {badge || "PROMO"}
                  </span>
                )}
                {p.destaque && !emPromocao && (
                  <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-yellow-400 text-primary text-[9px] sm:text-[10px] font-extrabold px-1.5 sm:px-2 py-0.5 rounded-sm shadow-md uppercase tracking-wider z-10">
                    ★ DESTAQUE
                  </span>
                )}

                <div className="aspect-square bg-gray-100 overflow-hidden relative group/img">
                  <ImageCarousel
                    images={parseImageUrls(p.imagem_urls).map((url) =>
                      url.startsWith("data:") ? url : url.replace(/\/(small|medium|large)\.jpg$/i, "/small.jpg")
                    )}
                    alt={p.nome}
                    onImageClick={(i) => setLightbox({
                      images: parseImageUrls(p.imagem_urls).map((url) =>
                        url.startsWith("data:") ? url : url.replace(/\/(small|medium|large)\.jpg$/i, "/large.jpg")
                      ),
                      alt: p.nome,
                      index: i,
                    })}
                  />
                  <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none flex items-center gap-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                    Ampliar
                  </div>
                </div>

                <div className="p-2.5 sm:p-4 flex flex-col flex-1">
                  <div className="font-semibold text-xs sm:text-[0.95rem] mb-1 sm:mb-2 line-clamp-2">
                    {p.nome}
                  </div>

                  <div className="flex gap-1 sm:gap-2 mb-1.5 sm:mb-2">
                    <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-primary text-white rounded">
                      {p.tipo}
                    </span>
                    <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-primary text-white rounded">
                      {p.temporada}
                    </span>
                  </div>

                  <div className="mt-auto">
                    {promo !== null ? (
                      <div>
                        <div className="flex items-baseline gap-1 sm:gap-2">
                          <span className="font-bold text-sm sm:text-lg text-accent">{formatarMoeda(promo)}</span>
                          <span className="text-text-muted text-[10px] sm:text-sm line-through">{formatarMoeda(base)}</span>
                        </div>
                        {badge && (
                          <span className="inline-block mt-0.5 text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 bg-accent/15 text-accent rounded-sm uppercase tracking-wider">{discountLabel || badge}</span>
                        )}
                      </div>
                    ) : (
                      <div className="font-bold text-sm sm:text-lg text-accent">{formatarMoeda(base)}</div>
                    )}
                  </div>

                  <button
                    className="w-full py-2 sm:py-3 text-xs sm:text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 mt-2 sm:mt-3 flex-shrink-0 h-9 sm:h-11 flex items-center justify-center"
                    onClick={() => setProdutoSelecionado(p)}
                  >
                    Adicionar ao Carrinho
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {visibleCount < produtosFiltrados.length && (
        <div className="text-center mt-8">
          <button
            className="px-8 py-3 text-sm font-semibold bg-primary text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
            onClick={() => setVisibleCount((prev) => prev + 24)}
          >
            Mostrar mais ({produtosFiltrados.length - visibleCount} restantes)
          </button>
        </div>
      )}

      {produtoSelecionado && (
        <CartModal
          produto={produtoSelecionado}
          config={config}
          onClose={() => setProdutoSelecionado(null)}
          onAdded={(nome) => {
            setToastProduto(nome);
            setToastVisible(true);
          }}
        />
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          alt={lightbox.alt}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
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
    </>
  );
}
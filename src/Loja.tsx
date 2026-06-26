import { useState, useMemo, useEffect } from "react";

const META_DESC = "RM Imports — Camisas de time e outros importados. Frete grátis em Bezerros-PE.";
import type { DbProduto } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import CartModal from "./CartModal";
import ImageCarousel from "./ImageCarousel";
import ImageLightbox from "./ImageLightbox";
import DestaqueCarousel from "./DestaqueCarousel";
import type { LojaConfig, PromocaoTipo, CachedImageMap } from "./types";
import { formatarMoeda, getPrecoProduto } from "./types";
import { normalizeNome, normalizarBusca } from "./lib/utils";
import { TIPO_SHORT } from "./lib/status";

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

type Ordenacao = "time" | "preco-asc" | "preco-desc" | "categoria" | "temporada-asc" | "temporada-desc";

/** Converte "2025/2026" → 2025, "1992/1994" → 1992, "25/26" → 2025, "98/99" → 1998, "2026" → 2026 */
export function parseAnoTemporada(t: string): number {
  const slash = t.indexOf("/");
  if (slash === -1) {
    const n = parseInt(t, 10);
    return isNaN(n) ? 0 : n;
  }
  const first = t.slice(0, slash);
  const ano = parseInt(first, 10);
  if (isNaN(ano)) return 0;
  // Suporta formato completo (2025/2026) e curto (25/26)
  return first.length <= 2
    ? (ano >= 50 ? 1900 + ano : 2000 + ano)
    : ano;
}

export default function Loja({ produtos, config }: { produtos: DbProduto[]; config: LojaConfig }) {
  useEffect(() => {
    document.title = "RM Imports";
    document.querySelector('meta[name="description"]')?.setAttribute("content", META_DESC);
  }, []);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Todas");
  const [filtroTime, setFiltroTime] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroBusca, setFiltroBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("time");
  const [produtoSelecionado, setProdutoSelecionado] = useState<DbProduto | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastProduto, setToastProduto] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [lightbox, setLightbox] = useState<{ images: string[]; alt: string; index: number; cachedImageUrls?: CachedImageMap | null } | null>(null);

  useEffect(() => {
    setVisibleCount(12);
  }, [categoriaSelecionada, filtroTime, filtroTipo, filtroBusca]);

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
      if (filtroTipo === "__feminino__") {
        res = res.filter((p) => p.feminino);
      } else {
        res = res.filter((p) => p.tipo === filtroTipo);
      }
    }
    if (filtroBusca) {
      const words = normalizarBusca(filtroBusca).split(" ").filter(Boolean);
      res = res.filter((p) => {
        const campos = normalizarBusca([p.nome, p.time, p.tipo, p.temporada].join(" "));
        return words.every((w) => campos.includes(w));
      });
    }

    // Sort
    switch (ordenacao) {
      case "time":
        res.sort((a, b) => a.time.localeCompare(b.time) || a.nome.localeCompare(b.nome));
        break;
      case "preco-asc": {
        res.sort((a, b) => {
          const priceA = getPrecoProduto(a.tipo, config, a.preco_customizado, (a.promocao_tipo as PromocaoTipo) ?? undefined, a.promocao_valor, a.time);
          const priceB = getPrecoProduto(b.tipo, config, b.preco_customizado, (b.promocao_tipo as PromocaoTipo) ?? undefined, b.promocao_valor, b.time);
          const valA = priceA.promo ?? priceA.base;
          const valB = priceB.promo ?? priceB.base;
          return valA - valB;
        });
        break;
      }
      case "preco-desc": {
        res.sort((a, b) => {
          const priceA = getPrecoProduto(a.tipo, config, a.preco_customizado, (a.promocao_tipo as PromocaoTipo) ?? undefined, a.promocao_valor, a.time);
          const priceB = getPrecoProduto(b.tipo, config, b.preco_customizado, (b.promocao_tipo as PromocaoTipo) ?? undefined, b.promocao_valor, b.time);
          const valA = priceA.promo ?? priceA.base;
          const valB = priceB.promo ?? priceB.base;
          return valB - valA;
        });
        break;
      }
      case "categoria":
        res.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.time.localeCompare(b.time) || a.nome.localeCompare(b.nome));
        break;
      case "temporada-asc":
        res.sort((a, b) => parseAnoTemporada(a.temporada) - parseAnoTemporada(b.temporada) || a.time.localeCompare(b.time) || a.nome.localeCompare(b.nome));
        break;
      case "temporada-desc":
        res.sort((a, b) => parseAnoTemporada(b.temporada) - parseAnoTemporada(a.temporada) || a.time.localeCompare(b.time) || a.nome.localeCompare(b.nome));
        break;
    }

    return res;
  }, [produtosNormalizados, categoriaSelecionada, filtroTime, filtroTipo, filtroBusca, ordenacao, config]);

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

  const destaques = useMemo(() => {
    return produtos
      .filter((p) => p.destaque)
      .sort((a, b) => {
        const aOrdem = a.ordem_destaque ?? 9999;
        const bOrdem = b.ordem_destaque ?? 9999;
        return aOrdem - bOrdem;
      });
  }, [produtos]);

  return (
    <>
      {/* Destaques carousel — full width */}
      {destaques.length > 0 && (
        <DestaqueCarousel
          produtos={destaques}
          config={config}
          onSelect={(p) => setProdutoSelecionado(p)}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 pt-4 pb-8" id="main-content">
      <nav className="flex justify-center gap-1.5 sm:gap-2 flex-wrap mb-4" aria-label="Filtrar por categoria">
        {CATEGORIAS.map((cat) => (
          <button
            key={cat}
            className={`px-2.5 py-1.5 sm:px-4 sm:py-2 border border-border bg-card-bg rounded-full cursor-pointer whitespace-nowrap text-xs sm:text-sm transition-colors ${
              categoriaSelecionada === cat
                ? "bg-primary text-white border-primary"
                : "text-text-main hover:bg-gray-100"
            }`}
            onClick={() => {
              setCategoriaSelecionada(cat);
              setFiltroTime("");
              setFiltroTipo("");
              setFiltroBusca("");
            }}
          >
            {cat}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-2 sm:flex gap-1 sm:gap-2 my-4">
        <label className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
            <span className="text-[10px] sm:text-xs text-text-muted font-medium pl-1">Buscar</span>
            <input
              type="text"
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              placeholder="Nome, time..."
              className="w-full px-2 py-1.5 sm:px-3 sm:py-2 border border-border rounded-md bg-card-bg text-xs sm:text-sm"
            />
          </label>

        {timesDisponiveis.length > 0 && (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] sm:text-xs text-text-muted font-medium pl-1">Time</span>
            <select
              value={filtroTime}
              onChange={(e) => setFiltroTime(e.target.value)}
              className="w-full px-2 py-1.5 sm:px-3 sm:py-2 border border-border rounded-md bg-card-bg text-xs sm:text-sm"
              aria-label="Filtrar por time"
            >
              <option value="">Todos os times</option>
              {timesDisponiveis.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}

        {tiposDisponiveis.length > 0 && (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] sm:text-xs text-text-muted font-medium pl-1">Tipo</span>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="w-full px-2 py-1.5 sm:px-3 sm:py-2 border border-border rounded-md bg-card-bg text-xs sm:text-sm"
              aria-label="Filtrar por tipo"
            >
              <option value="">Todos os tipos</option>
              {tiposDisponiveis.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__feminino__">Versão feminina</option>
            </select>
          </label>
        )}

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] sm:text-xs text-text-muted font-medium pl-1">Ordenar</span>
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
              className="w-full px-2 py-1.5 sm:px-3 sm:py-2 border border-border rounded-md bg-card-bg text-xs sm:text-sm"
              aria-label="Ordenar produtos"
            >
              <option value="time">Time / Nome</option>
              <option value="preco-asc">Menor preço</option>
              <option value="preco-desc">Maior preço</option>
              <option value="categoria">Categoria</option>
              <option value="temporada-asc">Temp. mais antiga</option>
              <option value="temporada-desc">Temp. mais recente</option>
            </select>
          </label>

        {(filtroTime || filtroTipo || filtroBusca) && (
          <button
            className="self-center px-2 py-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-xs bg-text-muted text-white rounded-md cursor-pointer hover:opacity-90 whitespace-nowrap"
            onClick={() => { setFiltroTime(""); setFiltroTipo(""); setFiltroBusca(""); }}
            aria-label="Limpar filtros"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {produtosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          {(filtroTime || filtroTipo || filtroBusca) ? (
            <>
              <p className="text-4xl mb-4">🔍</p>
              <p className="text-lg font-semibold text-primary mb-2">Nenhum produto encontrado</p>
              <p>Tente ajustar os filtros ou a busca.</p>
            </>
          ) : (
            <>
              <p className="text-4xl mb-4">🚧</p>
              <p className="text-lg font-semibold text-primary mb-2">Em breve!</p>
              <p>Estamos preparando novidades para esta categoria.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 sm:gap-6 items-stretch">
          {produtosFiltrados.slice(0, visibleCount).map((p) => {
            const priceInfo = getPrecoProduto(p.tipo, config, p.preco_customizado, (p.promocao_tipo as PromocaoTipo) ?? undefined, p.promocao_valor, p.time);
            const { base, promo, emPromocao, badge, discountLabel } = priceInfo;

            return (
              <div
                key={p.id}
                className="product-card-hover bg-card-bg rounded-lg overflow-hidden shadow-card border border-border hover:-translate-y-1 hover:shadow-card-hover hover:border-accent/20 transition-all duration-300 ease-out cursor-default flex flex-col h-full relative"
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
                {!emPromocao && !p.destaque && p.created_at && Date.now() - new Date(p.created_at).getTime() < 7 * 86400000 && (
                  <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-green-500 text-white text-[9px] sm:text-[10px] font-extrabold px-1.5 sm:px-2 py-0.5 rounded-sm shadow-md uppercase tracking-wider z-10">
                    NOVO
                  </span>
                )}

                <div className="aspect-square bg-gray-100 overflow-hidden relative group/img">
                  <ImageCarousel
                    images={parseImageUrls(p.imagem_urls)}
                    alt={p.nome}
                    cachedImageUrls={p.cached_image_urls}
                    onImageClick={(i) => setLightbox({
                      images: parseImageUrls(p.imagem_urls),
                      alt: p.nome,
                      index: i,
                      cachedImageUrls: p.cached_image_urls,
                    })}
                  />
                  <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none flex items-center gap-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                    Ampliar
                  </div>
                </div>

                <div className="p-2.5 sm:p-4 flex flex-col flex-1">
                  <div className="font-semibold text-xs sm:text-[0.95rem] mb-1 sm:mb-2 line-clamp-2 min-h-[2.5em] sm:min-h-[2.6em]">
                    {p.nome}
                  </div>

                  <div className="flex gap-1 sm:gap-2 mb-1.5 sm:mb-2 overflow-hidden">
                    <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-primary text-white rounded shrink-0" title={p.tipo}>
                      {TIPO_SHORT[p.tipo] || p.tipo}{p.feminino ? " (F e M)" : ""}
                    </span>
                    <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-primary text-white rounded shrink-0" title={p.temporada}>
                      {p.temporada}
                    </span>
                  </div>

                  <div className="mt-auto">
                    <div className="flex items-baseline gap-1 sm:gap-2 min-h-[1.25rem] sm:min-h-[1.75rem]">
                      <span className="font-bold text-sm sm:text-lg text-accent">{formatarMoeda(promo ?? base)}</span>
                      {promo !== null && (
                        <span className="text-text-muted text-[10px] sm:text-sm line-through">{formatarMoeda(base)}</span>
                      )}
                    </div>
                    <div className="min-h-[1rem] sm:min-h-[1.25rem]">
                      {emPromocao && badge && (
                        <span className="inline-block text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 bg-accent/15 text-accent rounded-sm uppercase tracking-wider">{discountLabel || badge}</span>
                      )}
                    </div>
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
            onClick={() => setVisibleCount((prev) => prev + 12)}
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
          cachedImageUrls={lightbox.cachedImageUrls}
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
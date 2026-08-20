import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

const META_DESC = "RM Imports — Camisas de time e outros importados. Frete grátis em Bezerros-PE.";
const CURRENT_TIME = Date.now();
import type { DbProduto } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import ImageCarousel from "./ImageCarousel";
import type { LojaConfig, PromocaoTipo } from "./types";
import { formatarPreco, getCachedImageUrl, getPrecoProduto } from "./types";
import { normalizeNome, normalizarBusca, parseAnoTemporada, slugify } from "./lib/utils";
import { TIPO_SHORT } from "./lib/status";
import useBodyScrollLock from "./hooks/useBodyScrollLock";

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

export default function Loja({ produtos, config }: { produtos: DbProduto[]; config: LojaConfig }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    document.title = "RM Imports";
    document.querySelector('meta[name="description"]')?.setAttribute("content", META_DESC);
  }, []);

  const categoriaSelecionada = searchParams.get("liga") || "Todas";
  const filtroTime = searchParams.get("time") || "";
  const filtroTipo = searchParams.get("tipo") || "";
  const filtroBusca = searchParams.get("busca") || "";
  const ordemParam = searchParams.get("ordem");
  const ordenacao: Ordenacao =
    ordemParam === "time" ||
    ordemParam === "preco-asc" ||
    ordemParam === "preco-desc" ||
    ordemParam === "categoria" ||
    ordemParam === "temporada-asc" ||
    ordemParam === "temporada-desc"
      ? ordemParam
      : "time";
  const precoMinParam = searchParams.get("precoMin");
  const precoMaxParam = searchParams.get("precoMax");
  const precoMin =
    precoMinParam != null &&
    precoMinParam.trim() !== "" &&
    Number.isFinite(Number(precoMinParam)) &&
    Number(precoMinParam) >= 0
      ? Number(precoMinParam)
      : undefined;
  const precoMax =
    precoMaxParam != null &&
    precoMaxParam.trim() !== "" &&
    Number.isFinite(Number(precoMaxParam)) &&
    Number(precoMaxParam) >= 0
      ? Number(precoMaxParam)
      : undefined;
  const filtrosAtivos =
    categoriaSelecionada !== "Todas" ||
    Boolean(filtroTime) ||
    Boolean(filtroTipo) ||
    Boolean(filtroBusca) ||
    ordenacao !== "time" ||
    precoMin !== undefined ||
    precoMax !== undefined;

  const filterKey = searchParams.toString();
  const [pagination, setPagination] = useState({ key: filterKey, count: 12 });
  const visibleCount = pagination.key === filterKey ? pagination.count : 12;
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterDrawerRef = useRef<HTMLDivElement>(null);
  const filterCloseButtonRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(showFilters);

  const closeFilters = () => {
    setShowFilters(false);
    filterButtonRef.current?.focus();
  };

  const limparBusca = (inputId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("busca");
      return next;
    }, { replace: true });
    document.getElementById(inputId)?.focus();
  };

  useEffect(() => {
    if (!showFilters) return;

    filterCloseButtonRef.current?.focus();

    const handleFilterKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFilters();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        filterDrawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hidden && !element.closest(".hidden"));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleFilterKeyDown);
    return () => window.removeEventListener("keydown", handleFilterKeyDown);
  }, [showFilters]);

  useEffect(() => {
    if (linkCopiado) {
      const timer = setTimeout(() => setLinkCopiado(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [linkCopiado]);

  const produtosNormalizados = useMemo(() => {
    return produtos.map((p) => ({
      ...p,
      nome: normalizeNome(p.nome),
      time: normalizeNome(p.time),
      liga: normalizeNome(p.liga),
    }));
  }, [produtos]);

  // Cache prices per product — avoids recomputing on every filter/sort change
  const priceCache = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of produtosNormalizados) {
      const info = getPrecoProduto(p.tipo, config, p.preco_customizado, (p.promocao_tipo as PromocaoTipo) ?? undefined, p.promocao_valor, p.time);
      map.set(p.id, info.promo ?? info.base);
    }
    return map;
  }, [produtosNormalizados, config]);

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
    if (precoMin !== undefined) {
      res = res.filter((p) => (priceCache.get(p.id) ?? 0) >= precoMin);
    }
    if (precoMax !== undefined) {
      res = res.filter((p) => (priceCache.get(p.id) ?? 0) <= precoMax);
    }

    // Pre-compute prices for sorting
    const precos = priceCache;

    switch (ordenacao) {
      case "time":
        res.sort((a, b) => a.time.localeCompare(b.time) || a.nome.localeCompare(b.nome));
        break;
      case "preco-asc":
        res.sort((a, b) => (precos.get(a.id) ?? 0) - (precos.get(b.id) ?? 0));
        break;
      case "preco-desc":
        res.sort((a, b) => (precos.get(b.id) ?? 0) - (precos.get(a.id) ?? 0));
        break;
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
  }, [produtosNormalizados, categoriaSelecionada, filtroTime, filtroTipo, filtroBusca, ordenacao, precoMin, precoMax, priceCache]);

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

  const heroItems = destaques.length > 0 ? destaques.slice(0, 8) : produtos.slice(0, 1);
  const heroPosition = heroItems.length > 0 ? heroIndex % heroItems.length : 0;

  useEffect(() => {
    if (heroItems.length <= 1) return;
    const timer = window.setInterval(() => setHeroIndex((current) => (current + 1) % heroItems.length), 4500);
    return () => window.clearInterval(timer);
  }, [heroItems.length]);

  const heroProduct = heroItems[heroPosition];
  const heroImageSource = heroProduct ? parseImageUrls(heroProduct.imagem_urls)[0] : "";
  const heroImage = heroProduct && heroImageSource
    ? getCachedImageUrl(heroImageSource, heroProduct.cached_image_urls, 0, "large")
    : "";
  const heroPrice = heroProduct
    ? getPrecoProduto(heroProduct.tipo, config, heroProduct.preco_customizado, (heroProduct.promocao_tipo as PromocaoTipo) ?? undefined, heroProduct.promocao_valor, heroProduct.time)
    : null;
  const activeFilterCount = [
    categoriaSelecionada !== "Todas",
    Boolean(filtroTime),
    Boolean(filtroTipo),
    precoMin !== undefined,
    precoMax !== undefined,
  ].filter(Boolean).length;
  const refinamentosAtivos = Boolean(filtroTime) || Boolean(filtroTipo) || Boolean(filtroBusca) || precoMin !== undefined || precoMax !== undefined;
  const categoriaSemProdutos = categoriaSelecionada !== "Todas" && !refinamentosAtivos;

  return (
    <div id="main-content">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-7 lg:px-8">
        <section
          className="relative isolate overflow-hidden rounded-[24px] bg-primary text-white shadow-[0_28px_80px_rgba(17,20,41,.22)] sm:rounded-[32px]"
          aria-labelledby="hero-title"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,.1),transparent_28%),radial-gradient(circle_at_80%_85%,rgba(240,68,85,.18),transparent_30%)]" aria-hidden="true" />
          <div className="relative grid min-h-[470px] items-center lg:grid-cols-[1.05fr_.95fr]">
            <div className="px-6 py-10 sm:px-10 sm:py-14 lg:px-16 lg:py-20">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Coleção 2026
              </span>
              <h1 id="hero-title" className="mt-5 max-w-2xl text-4xl font-black leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Vista o jogo.<br /><span className="text-white/55">Carregue a história.</span>
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
                Camisas atuais e retrô escolhidas para quem leva o time além dos 90 minutos.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a href="#catalogo" className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 hover:bg-[#ff5364]">
                  Explorar coleção
                </a>
                <Link to="/pronta-entrega" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-bold text-white transition-colors hover:bg-white/10">
                  Ver pronta entrega
                </Link>
              </div>
            </div>
            {heroProduct && heroImage && (
              <div
                className="relative mx-5 mb-5 min-h-[330px] overflow-hidden rounded-[20px] bg-white/5 sm:mx-8 sm:mb-8 lg:m-8 lg:ml-0 lg:min-h-[520px]"
              >
                <Link key={heroProduct.id} to={`/produto/${heroProduct.id}/${slugify(heroProduct.nome)}`} className="animate-hero-product group absolute inset-0" aria-label={`Ver ${heroProduct.nome}`}>
                  <div className="animate-hero-product-image absolute inset-0">
                    <img src={heroImage} alt={heroProduct.nome} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/5 to-transparent" />
                  </div>
                  <div className="animate-hero-product-info absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7">
                    <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">Em destaque</p><p className="mt-1 max-w-[15rem] text-lg font-bold leading-tight text-white sm:text-xl">{heroProduct.nome}</p></div>
                    {heroPrice && <span className="shrink-0 rounded-full bg-white px-3 py-2 text-sm font-black text-primary">{formatarPreco(heroPrice.promo ?? heroPrice.base)}</span>}
                  </div>
                </Link>
                {heroItems.length > 1 && (
                  <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
                    <span className="rounded-full bg-primary/70 px-2.5 py-2 text-[10px] font-bold text-white backdrop-blur-sm">{heroPosition + 1} / {heroItems.length}</span>
                    <button type="button" onClick={() => setHeroIndex((current) => (current - 1 + heroItems.length) % heroItems.length)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-primary shadow-md transition-colors hover:bg-white" aria-label="Destaque anterior">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <button type="button" onClick={() => setHeroIndex((current) => (current + 1) % heroItems.length)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-primary shadow-md transition-colors hover:bg-white" aria-label="Próximo destaque">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <ul className="mt-4 grid overflow-hidden rounded-2xl border border-border bg-card-bg shadow-card sm:grid-cols-3" aria-label="Informações de compra">
          <li className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="10" width="18" height="11" rx="2" />
                <path d="M7 10V7a5 5 0 0 1 10 0v3" />
              </svg>
            </span>
            <span className="min-w-0 text-xs leading-5 text-text-muted">
              <strong className="block text-sm text-text-main">Pagamento seguro</strong>
              via Mercado Pago
            </span>
          </li>
          <li className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
                <circle cx="7" cy="19" r="2" />
                <circle cx="18" cy="19" r="2" />
              </svg>
            </span>
            <span className="min-w-0 text-xs leading-5 text-text-muted">
              <strong className="block text-sm text-text-main">Entrega grátis</strong>
              em Bezerros-PE
            </span>
          </li>
          <li className="flex min-w-0 items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-7h6v7M8 10h.01M12 10h.01M16 10h.01" />
              </svg>
            </span>
            <span className="min-w-0 text-xs leading-5 text-text-muted">
              <strong className="block text-sm text-text-main">Retirada</strong>
              em Caruaru
            </span>
          </li>
        </ul>

      </div>

      <div className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-12 pt-12 sm:px-6 sm:pt-16 lg:px-8" id="catalogo">
        <div className="mb-5 flex items-end justify-between gap-4 sm:mb-7">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Catálogo</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.03em] text-primary sm:text-4xl">Encontre a camisa ideal</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">Busque por time, coleção ou temporada. A gente cuida do resto.</p>
          </div>
          <span className="hidden shrink-0 text-sm font-semibold text-text-muted sm:block">{produtosFiltrados.length} produtos</span>
        </div>
      <nav className="carousel-scroll -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Filtrar por categoria">
        {CATEGORIAS.map((cat) => (
          <button
            key={cat}
            className={`min-h-10 shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 text-xs font-bold transition-colors sm:text-sm ${
              categoriaSelecionada === cat
                ? "border-primary bg-primary text-white"
                : "border-border bg-card-bg text-text-main hover:border-primary/30 hover:bg-primary/5"
            }`}
            onClick={() => {
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                if (cat === "Todas") next.delete("liga");
                else next.set("liga", cat);
                next.delete("time");
                next.delete("tipo");
                next.delete("busca");
                return next;
              });
            }}
          >
            {cat}
          </button>
        ))}
      </nav>

      <div className="mb-4 grid grid-cols-[1fr_auto] gap-2 sm:hidden">
        <div className="relative">
          <label htmlFor="busca-mobile" className="sr-only">Buscar produtos</label>
          <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
          <input
            id="busca-mobile"
            type="search"
            value={filtroBusca}
            onChange={(e) => {
              const value = e.target.value;
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                if (value) next.set("busca", value); else next.delete("busca");
                return next;
              }, { replace: true });
            }}
            placeholder="Buscar time ou camisa"
            className="h-12 w-full rounded-xl border border-border bg-card-bg pl-11 pr-12 text-sm shadow-card"
          />
          {filtroBusca !== "" && (
            <button
              type="button"
              onClick={() => limparBusca("busca-mobile")}
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-primary"
              aria-label="Limpar busca"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          )}
        </div>
        <button ref={filterButtonRef} type="button" onClick={() => setShowFilters(true)} className="relative flex h-12 items-center gap-2 rounded-xl border border-border bg-card-bg px-4 text-sm font-bold text-primary shadow-card" aria-label="Abrir filtros">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
          Filtros
          {activeFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-white">{activeFilterCount}</span>}
        </button>
      </div>

      {showFilters && <button type="button" className="fixed inset-0 z-[1090] bg-primary/60 backdrop-blur-sm sm:hidden" onClick={closeFilters} aria-label="Fechar filtros" />}
      <div ref={filterDrawerRef} className={`${showFilters ? "fixed inset-x-3 bottom-3 z-[1100] grid max-h-[84dvh] grid-cols-2 overflow-y-auto rounded-3xl bg-card-bg p-4 shadow-2xl" : "hidden"} gap-3 sm:static sm:my-5 sm:flex sm:max-h-none sm:flex-wrap sm:overflow-visible sm:rounded-2xl sm:border sm:border-border sm:bg-card-bg sm:p-4 sm:shadow-card`} role={showFilters ? "dialog" : undefined} aria-modal={showFilters ? "true" : undefined} aria-label="Filtros do catálogo">
        <div className="col-span-2 mb-1 flex items-center justify-between sm:hidden">
          <div><p className="text-lg font-black text-primary">Filtrar produtos</p><p className="text-xs text-text-muted">{produtosFiltrados.length} resultados</p></div>
          <button ref={filterCloseButtonRef} type="button" onClick={closeFilters} className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-base text-2xl text-primary" aria-label="Fechar filtros">×</button>
        </div>
        <div className="col-span-2 hidden flex-1 flex-col gap-1 sm:flex sm:min-w-[220px]">
            <label htmlFor="busca-desktop" className="text-[10px] font-medium text-text-muted sm:text-xs">Buscar</label>
            <div className="relative">
            <input
              id="busca-desktop"
              type="text"
              value={filtroBusca}
              onChange={(e) => {
                const value = e.target.value;
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (value) next.set("busca", value);
                  else next.delete("busca");
                  return next;
                }, { replace: true });
              }}
              placeholder="Nome, time..."
              className="h-11 w-full rounded-lg border border-border bg-bg-base px-3 pr-12 text-sm"
            />
              {filtroBusca !== "" && (
                <button
                  type="button"
                  onClick={() => limparBusca("busca-desktop")}
                  className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-primary"
                  aria-label="Limpar busca"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              )}
            </div>
          </div>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[10px] sm:text-xs text-text-muted font-medium pl-1">Preço mín.</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={precoMin ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                const numberValue = Number(value);
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (value.trim() !== "" && Number.isFinite(numberValue) && numberValue >= 0) {
                    next.set("precoMin", value);
                  } else {
                    next.delete("precoMin");
                  }
                  return next;
                }, { replace: true });
              }}
              placeholder="0,00"
              className="h-11 w-full rounded-lg border border-border bg-bg-base px-3 text-sm"
              aria-label="Preço mínimo"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[10px] sm:text-xs text-text-muted font-medium pl-1">Preço máx.</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={precoMax ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                const numberValue = Number(value);
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (value.trim() !== "" && Number.isFinite(numberValue) && numberValue >= 0) {
                    next.set("precoMax", value);
                  } else {
                    next.delete("precoMax");
                  }
                  return next;
                }, { replace: true });
              }}
              placeholder="0,00"
              className="h-11 w-full rounded-lg border border-border bg-bg-base px-3 text-sm"
              aria-label="Preço máximo"
            />
          </label>

        {timesDisponiveis.length > 0 && (
          <label className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
            <span className="text-[10px] sm:text-xs text-text-muted font-medium pl-1">Time</span>
            <select
              value={filtroTime}
              onChange={(e) => {
                const value = e.target.value;
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (value) next.set("time", value);
                  else next.delete("time");
                  return next;
                });
              }}
              className="h-11 w-full rounded-lg border border-border bg-bg-base px-3 text-sm"
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
          <label className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
            <span className="text-[10px] sm:text-xs text-text-muted font-medium pl-1">Tipo</span>
            <select
              value={filtroTipo}
              onChange={(e) => {
                const value = e.target.value;
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (value) next.set("tipo", value);
                  else next.delete("tipo");
                  return next;
                });
              }}
              className="h-11 w-full rounded-lg border border-border bg-bg-base px-3 text-sm"
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

          <label className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
            <span className="text-[10px] sm:text-xs text-text-muted font-medium pl-1">Ordenar</span>
            <select
              value={ordenacao}
              onChange={(e) => {
                const value = e.target.value;
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (value === "time") next.delete("ordem");
                  else next.set("ordem", value);
                  return next;
                });
              }}
              className="h-11 w-full rounded-lg border border-border bg-bg-base px-3 text-sm"
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

        {filtrosAtivos && (
          <>
            <button
              className="col-span-2 min-h-11 self-end whitespace-nowrap rounded-lg border border-accent px-3 text-xs font-bold text-accent hover:bg-accent/10 sm:col-span-1"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setLinkCopiado(true);
                } catch {
                  setLinkCopiado(false);
                }
              }}
              aria-label="Copiar link dos filtros"
            >
              Copiar link dos filtros
            </button>
            {linkCopiado && (
              <span className="self-center text-[10px] sm:text-xs text-accent" role="status" aria-live="polite">
                Link copiado!
              </span>
            )}
          </>
        )}
        {filtrosAtivos && (
          <button
            className="col-span-2 min-h-11 self-end whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-bold text-white hover:opacity-90 sm:col-span-1"
            onClick={() => {
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.delete("liga");
                next.delete("time");
                next.delete("tipo");
                next.delete("busca");
                next.delete("ordem");
                next.delete("precoMin");
                next.delete("precoMax");
                return next;
              });
            }}
            aria-label="Limpar filtros"
          >
            Limpar filtros
          </button>
        )}
        <button type="button" onClick={closeFilters} className="col-span-2 mt-1 min-h-12 rounded-xl bg-accent text-sm font-bold text-white sm:hidden">
          Ver {produtosFiltrados.length} produtos
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between sm:mb-5">
        <span className="text-sm font-semibold text-text-muted sm:hidden">{produtosFiltrados.length} produtos</span>
        {filtrosAtivos && <span className="text-xs font-semibold text-accent">Filtros ativos</span>}
      </div>

      {produtosFiltrados.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card-bg px-6 py-16 text-center text-text-muted">
          {categoriaSemProdutos ? (
            <>
              <p className="mb-2 text-lg font-bold text-primary">Novidades em breve</p>
              <p>Produtos dessa coleção chegarão em breve.</p>
            </>
          ) : (
            <>
              <svg className="mx-auto mb-4 text-primary/35" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
              <p className="mb-2 text-lg font-bold text-primary">Nenhum produto encontrado</p>
              <p>Tente ajustar os filtros ou a busca.</p>
            </>
          )}
        </div>
      ) : (
        <div key={filterKey} className="grid grid-cols-2 items-stretch gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-5">
          {produtosFiltrados.slice(0, visibleCount).map((p, index) => {
            const priceInfo = getPrecoProduto(p.tipo, config, p.preco_customizado, (p.promocao_tipo as PromocaoTipo) ?? undefined, p.promocao_valor, p.time);
            const { base, promo, emPromocao, badge, discountLabel } = priceInfo;

            return (
              <div
                key={p.id}
                className="animate-catalog-card product-card-hover relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card-bg shadow-card transition-all duration-300 ease-out hover:-translate-y-1 hover:border-primary/15 hover:shadow-card-hover focus-within:-translate-y-1 focus-within:border-primary/15 focus-within:shadow-card-hover"
                style={{ animationDelay: `${index < 6 ? index * 45 : 0}ms` }}
              >
                <Link
                  to={`/produto/${p.id}/${slugify(p.nome)}`}
                  state={{ from: location.pathname + location.search }}
                  className="absolute inset-0 z-20"
                >
                  <span className="sr-only">Ver {p.nome}</span>
                </Link>

                {/* Promo/destaque tags */}
                {emPromocao && (
                  <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-accent px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-md sm:text-[10px]">
                    {badge || "PROMO"}
                  </span>
                )}
                {p.destaque && !emPromocao && (
                  <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-primary px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-md sm:text-[10px]">
                    Destaque
                  </span>
                )}
                {!emPromocao && !p.destaque && p.created_at && CURRENT_TIME - new Date(p.created_at).getTime() < 7 * 86400000 && (
                  <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-emerald-600 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-md sm:text-[10px]">
                    NOVO
                  </span>
                )}

                <div className="relative aspect-[4/4.6] overflow-hidden bg-[#eeeeeb] sm:aspect-square">
                  <ImageCarousel
                    images={parseImageUrls(p.imagem_urls)}
                    alt={p.nome}
                    cachedImageUrls={p.cached_image_urls}
                  />
                </div>

                <div className="flex flex-1 flex-col p-3 sm:p-4">
                  <h3 className="line-clamp-2 h-[2.6em] text-xs font-bold leading-[1.3] text-text-main sm:text-[0.95rem]">
                    {p.nome}
                  </h3>

                  <div className="mb-2 mt-2 flex gap-1 overflow-hidden sm:gap-2">
                    <span className="pointer-events-none shrink-0 rounded-md bg-primary/7 px-1.5 py-1 text-[9px] font-bold text-primary sm:px-2 sm:text-[10px]" title={p.tipo}>
                      {TIPO_SHORT[p.tipo] || p.tipo}{p.feminino ? " (F e M)" : ""}
                    </span>
                    <span className="pointer-events-none shrink-0 rounded-md bg-primary/7 px-1.5 py-1 text-[9px] font-bold text-primary sm:px-2 sm:text-[10px]" title={p.temporada}>
                      {p.temporada}
                    </span>
                  </div>

                  <div className="mt-auto">
                    <div className="flex min-h-[1.5rem] items-baseline gap-1 sm:gap-2">
                        <span className="text-base font-black tracking-tight text-accent sm:text-xl">{formatarPreco(promo ?? base)}</span>
                        {promo != null && (
                          <span className="text-text-muted text-[10px] sm:text-sm line-through">{formatarPreco(base)}</span>
                      )}
                    </div>
                    <div className="min-h-[1rem] sm:min-h-[1.25rem]">
                      {emPromocao && badge && (
                        <span className="inline-block text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 bg-accent/15 text-accent rounded-sm uppercase tracking-wider">{discountLabel || badge}</span>
                      )}
                    </div>
                  </div>

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
            onClick={() => setPagination({ key: filterKey, count: visibleCount + 12 })}
          >
            Mostrar mais ({produtosFiltrados.length - visibleCount} restantes)
          </button>
        </div>
      )}

    </div>
    </div>
  );
}

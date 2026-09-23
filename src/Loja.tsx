import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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

const TIMES_PRINCIPAIS = [
  { nome: "Sport Recife", logo: "https://thumb.wikimedia.org/wikipedia/pt/thumb/1/1a/Sport-clube-recife.svg/250px-Sport-clube-recife.svg.png" },
  { nome: "Santa Cruz", logo: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/69/Santa_Cruz_Futebol_Clube_logo.svg/250px-Santa_Cruz_Futebol_Clube_logo.svg.png" },
  { nome: "Náutico", logo: "https://thumb.wikimedia.org/wikipedia/pt/thumb/d/de/Simbolo-escudo-nautico.png/250px-Simbolo-escudo-nautico.png" },
  { nome: "Flamengo", logo: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/Clube_de_Regatas_do_Flamengo_logo.svg/250px-Clube_de_Regatas_do_Flamengo_logo.svg.png" },
  { nome: "Corinthians", logo: "https://thumb.wikimedia.org/wikipedia/pt/thumb/b/b4/Corinthians_simbolo.png/250px-Corinthians_simbolo.png" },
  { nome: "Palmeiras", logo: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/SE_Palmeiras_2025_crest.png/250px-SE_Palmeiras_2025_crest.png" },
  { nome: "São Paulo", logo: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f4/S%C3%A3o_Paulo_Futebol_Clube_logo_%282022%29.svg/250px-S%C3%A3o_Paulo_Futebol_Clube_logo_%282022%29.svg.png" },
  { nome: "Vasco da Gama", logo: "https://thumb.wikimedia.org/wikipedia/pt/thumb/8/8b/EscudoDoVascoDaGama.svg/250px-EscudoDoVascoDaGama.svg.png" },
  { nome: "Real Madrid", logo: "https://thumb.wikimedia.org/wikipedia/pt/thumb/9/98/Real_Madrid.png/250px-Real_Madrid.png" },
  { nome: "Barcelona", logo: "https://thumb.wikimedia.org/wikipedia/pt/thumb/4/43/FCBarcelona.svg/250px-FCBarcelona.svg.png" },
  { nome: "Manchester City", logo: "https://thumb.wikimedia.org/wikipedia/pt/thumb/0/02/Manchester_City_Football_Club.png/250px-Manchester_City_Football_Club.png" },
  { nome: "Brasil", logo: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Confedera%C3%A7%C3%A3o_Brasileira_de_Futebol_logo_%282020%29.svg/250px-Confedera%C3%A7%C3%A3o_Brasileira_de_Futebol_logo_%282020%29.svg.png" },
  { nome: "Santos", logo: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Santos_logo.svg/250px-Santos_logo.svg.png" },
  { nome: "PSG", logo: "https://thumb.wikimedia.org/wikipedia/en/thumb/a/a7/Paris_Saint-Germain_F.C..svg/250px-Paris_Saint-Germain_F.C..svg.png" },
];
const ORDEM_TIMES_PRINCIPAIS = new Map(TIMES_PRINCIPAIS.map(({ nome }, index) => [normalizeNome(nome), index]));

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
      : filtroTime ? "temporada-desc" : "time";
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
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [timesCanScroll, setTimesCanScroll] = useState(false);
  const [timesCanScrollLeft, setTimesCanScrollLeft] = useState(false);
  const [heroState, setHeroState] = useState<{ current: number; previous: number | null }>({ current: 0, previous: null });
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterDrawerRef = useRef<HTMLDivElement>(null);
  const filterCloseButtonRef = useRef<HTMLButtonElement>(null);
  const timesScrollRef = useRef<HTMLElement>(null);
  const timesScrollAnimationRef = useRef<number | null>(null);

  const updateTimesScroll = useCallback(() => {
    const strip = timesScrollRef.current;
    if (!strip) return;
    const cards = Array.from(strip.querySelectorAll<HTMLElement>("[data-team-card]"));
    const lastCard = cards[cards.length - 1];
    const viewportRight = strip.getBoundingClientRect().right;
    setTimesCanScrollLeft(strip.scrollLeft > 1);
    setTimesCanScroll(Boolean(lastCard && lastCard.getBoundingClientRect().right > viewportRight + 1));
  }, []);

  const animateTimesScroll = (target: number) => {
    const strip = timesScrollRef.current;
    if (!strip) return;

    if (timesScrollAnimationRef.current !== null) {
      window.cancelAnimationFrame(timesScrollAnimationRef.current);
      timesScrollAnimationRef.current = null;
    }

    const nextTarget = Math.max(0, target);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      strip.scrollLeft = nextTarget;
      return;
    }

    const start = strip.scrollLeft;
    const distance = nextTarget - start;
    if (Math.abs(distance) < 1) {
      strip.scrollLeft = nextTarget;
      return;
    }

    const startedAt = performance.now();
    const duration = 420;
    const frame = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      strip.scrollLeft = start + distance * eased;
      if (progress < 1) {
        timesScrollAnimationRef.current = window.requestAnimationFrame(frame);
      } else {
        strip.scrollLeft = nextTarget;
        timesScrollAnimationRef.current = null;
      }
    };

    timesScrollAnimationRef.current = window.requestAnimationFrame(frame);
  };

  const scrollTimes = (direction: -1 | 1) => {
    const strip = timesScrollRef.current;
    if (!strip) return;
    const cards = Array.from(strip.querySelectorAll<HTMLElement>("[data-team-card]"));
    if (direction === 1) {
      const viewportRight = strip.getBoundingClientRect().right;
      const nextCard = cards.find((card) => card.getBoundingClientRect().right > viewportRight + 1);
      if (!nextCard) return;
      const leftBandWidth = window.matchMedia("(min-width: 640px)").matches ? 56 : 64;
      animateTimesScroll(nextCard.offsetLeft - leftBandWidth);
      return;
    }

    animateTimesScroll(0);
  };

  useBodyScrollLock(showFilters);

  const closeFilters = () => {
    setShowFilters(false);
    filterButtonRef.current?.focus();
  };

  useEffect(() => {
    const strip = timesScrollRef.current;
    if (!strip) return;

    updateTimesScroll();
    strip.addEventListener("scroll", updateTimesScroll, { passive: true });
    window.addEventListener("resize", updateTimesScroll);
    return () => {
      if (timesScrollAnimationRef.current !== null) {
        window.cancelAnimationFrame(timesScrollAnimationRef.current);
        timesScrollAnimationRef.current = null;
      }
      strip.removeEventListener("scroll", updateTimesScroll);
      window.removeEventListener("resize", updateTimesScroll);
    };
  }, [updateTimesScroll]);

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
    if (shareFeedback) {
      const timer = setTimeout(() => setShareFeedback(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [shareFeedback]);

  const produtosNormalizados = useMemo(() => {
    return produtos.map((p) => ({
      ...p,
      nome: normalizeNome(p.nome),
      time: normalizeNome(p.time),
      liga: normalizeNome(p.liga),
    }));
  }, [produtos]);

  const todosTimes = useMemo(() => {
    const times = produtosNormalizados.map((p) => p.time.trim()).filter(Boolean);
    return Array.from(new Set(times)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtosNormalizados]);

  // Cache prices per product — avoids recomputing on every filter/sort change
  const priceCache = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of produtosNormalizados) {
      const info = getPrecoProduto(p.tipo, config, p.preco_customizado, (p.promocao_tipo as PromocaoTipo) ?? undefined, p.promocao_valor, p.time, p.temporada);
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
        if (
          categoriaSelecionada !== "Todas" ||
          filtroTime ||
          filtroTipo ||
          filtroBusca ||
          precoMin !== undefined ||
          precoMax !== undefined ||
          ordemParam !== null
        ) {
          res.sort((a, b) => a.time.localeCompare(b.time, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
          break;
        }
        res.sort((a, b) => {
          const anoA = parseAnoTemporada(a.temporada);
          const anoB = parseAnoTemporada(b.temporada);
          const rankA = anoA === config.ano_temporada_lancamento
            ? ORDEM_TIMES_PRINCIPAIS.get(a.time) ?? TIMES_PRINCIPAIS.length
            : TIMES_PRINCIPAIS.length;
          const rankB = anoB === config.ano_temporada_lancamento
            ? ORDEM_TIMES_PRINCIPAIS.get(b.time) ?? TIMES_PRINCIPAIS.length
            : TIMES_PRINCIPAIS.length;
          return rankA - rankB
            || (rankA < TIMES_PRINCIPAIS.length && rankB < TIMES_PRINCIPAIS.length
              ? a.nome.localeCompare(b.nome, "pt-BR") || anoB - anoA
              : a.time.localeCompare(b.time, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR") || anoB - anoA);
        });
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
  }, [produtosNormalizados, categoriaSelecionada, filtroTime, filtroTipo, filtroBusca, ordenacao, ordemParam, precoMin, precoMax, config.ano_temporada_lancamento, priceCache]);

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

  const heroItems = useMemo(
    () => (destaques.length > 0 ? destaques.slice(0, 8) : produtos.slice(0, 1)),
    [destaques, produtos],
  );
  const moveHero = useCallback((direction: 1 | -1) => {
    setHeroState((state) => {
      if (heroItems.length <= 1) return state;
      const current = ((state.current % heroItems.length) + heroItems.length) % heroItems.length;
      return {
        current: (current + direction + heroItems.length) % heroItems.length,
        previous: current,
      };
    });
  }, [heroItems.length]);

  useEffect(() => {
    if (heroItems.length <= 1) return;
    const timer = window.setInterval(() => moveHero(1), 4500);
    return () => window.clearInterval(timer);
  }, [moveHero, heroItems.length]);

  useEffect(() => {
    const previous = heroState.previous;
    if (previous === null) return;

    const timer = window.setTimeout(() => {
      setHeroState((state) => (state.previous === previous ? { ...state, previous: null } : state));
    }, 720);
    return () => window.clearTimeout(timer);
  }, [heroState.previous]);

  const heroPosition = heroItems.length > 0 ? ((heroState.current % heroItems.length) + heroItems.length) % heroItems.length : 0;
  const heroPreviousPosition = heroState.previous !== null && heroItems.length > 0
    ? ((heroState.previous % heroItems.length) + heroItems.length) % heroItems.length
    : null;
  const heroProduct = heroItems[heroPosition];
  const heroPreviousProduct = heroPreviousPosition !== null ? heroItems[heroPreviousPosition] : undefined;
  const heroImageSource = heroProduct ? parseImageUrls(heroProduct.imagem_urls)[0] : "";
  const heroImage = heroProduct && heroImageSource
    ? getCachedImageUrl(heroImageSource, heroProduct.cached_image_urls, 0, "large")
    : "";
  const heroPrice = heroProduct
    ? getPrecoProduto(heroProduct.tipo, config, heroProduct.preco_customizado, (heroProduct.promocao_tipo as PromocaoTipo) ?? undefined, heroProduct.promocao_valor, heroProduct.time, heroProduct.temporada)
    : null;
  const heroPreviousImageSource = heroPreviousProduct ? parseImageUrls(heroPreviousProduct.imagem_urls)[0] : "";
  const heroPreviousImage = heroPreviousProduct && heroPreviousImageSource
    ? getCachedImageUrl(heroPreviousImageSource, heroPreviousProduct.cached_image_urls, 0, "large")
    : "";
  const heroPreviousPrice = heroPreviousProduct
    ? getPrecoProduto(heroPreviousProduct.tipo, config, heroPreviousProduct.preco_customizado, (heroPreviousProduct.promocao_tipo as PromocaoTipo) ?? undefined, heroPreviousProduct.promocao_valor, heroPreviousProduct.time, heroPreviousProduct.temporada)
    : null;

  useEffect(() => {
    heroItems.forEach((heroItem) => {
      const imageSource = parseImageUrls(heroItem.imagem_urls)[0];
      if (!imageSource) return;

      const image = new Image();
      image.src = getCachedImageUrl(imageSource, heroItem.cached_image_urls, 0, "large");
      if (image.decode) void image.decode().catch(() => undefined);
    });
  }, [heroItems]);
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
                <Link to="/#catalogo" className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 hover:bg-[#ff5364]">
                  Explorar coleção
                </Link>
                <Link to="/pronta-entrega" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-bold text-white transition-colors hover:bg-white/10">
                  Ver pronta entrega
                </Link>
              </div>
            </div>
            {heroProduct && heroImage && (
              <div
                className="relative mx-5 mb-5 min-h-[330px] overflow-hidden rounded-[20px] bg-white/5 sm:mx-8 sm:mb-8 lg:m-8 lg:ml-0 lg:min-h-[520px]"
              >
                {heroPreviousProduct && heroPreviousImage && (
                  <Link
                    key={`previous-${heroPreviousProduct.id}`}
                    to={`/produto/${heroPreviousProduct.id}/${slugify(heroPreviousProduct.nome)}`}
                    className="animate-hero-slide-out group pointer-events-none absolute inset-0"
                    aria-label={`Ver ${heroPreviousProduct.nome}`}
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    <div className="absolute inset-0">
                      <img src={heroPreviousImage} alt={heroPreviousProduct.nome} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/5 to-transparent" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7">
                      <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">Em destaque</p><p className="mt-1 max-w-[15rem] text-lg font-bold leading-tight text-white sm:text-xl">{heroPreviousProduct.nome}</p></div>
                      {heroPreviousPrice && <span className="shrink-0 rounded-full bg-white px-3 py-2 text-sm font-black text-primary">{formatarPreco(heroPreviousPrice.promo ?? heroPreviousPrice.base)}</span>}
                    </div>
                  </Link>
                )}
                <Link key={`current-${heroProduct.id}`} to={`/produto/${heroProduct.id}/${slugify(heroProduct.nome)}`} className="animate-hero-slide-in group absolute inset-0 z-10" aria-label={`Ver ${heroProduct.nome}`}>
                  <div className="absolute inset-0">
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
                    <button type="button" onClick={() => moveHero(-1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-primary shadow-md transition-colors hover:bg-white" aria-label="Destaque anterior">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <button type="button" onClick={() => moveHero(1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-primary shadow-md transition-colors hover:bg-white" aria-label="Próximo destaque">
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

      <section className="mx-auto max-w-7xl px-4 pb-4 pt-8 sm:px-6 sm:pb-4 lg:px-8" aria-labelledby="times-title">
        <div className="mb-4 text-center sm:mb-5">
          <h2 id="times-title" className="text-2xl font-black tracking-[-0.03em] text-primary sm:text-3xl">Escolha seu time</h2>
          <p className="mt-2 text-sm text-text-muted">Encontre sua próxima camisa pelo escudo.</p>
        </div>
        <div className="relative -mx-4 sm:mx-0">
          <nav ref={timesScrollRef} style={{ columnGap: "max(0.75rem, calc((100% - 1012px) / 10))" }} className="carousel-scroll relative flex flex-nowrap overflow-x-auto pb-2 pl-[2px] mr-12 sm:mr-14 sm:pl-0" aria-label="Escolha seu time">
          {TIMES_PRINCIPAIS.map((time) => (
            <Link
              key={time.nome}
              to={`/?time=${encodeURIComponent(time.nome)}#catalogo`}
              data-team-card
              className="group flex w-24 shrink-0 flex-col items-center rounded-2xl p-2 text-center transition-colors hover:bg-primary/5 sm:w-[92px]"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-card-bg p-2 shadow-card transition-transform group-hover:scale-105">
                <img src={time.logo} alt="" width={72} height={72} loading="lazy" className="block h-14 w-14 max-h-full max-w-full object-contain" />
              </span>
              <span className="mt-2 text-xs font-bold leading-tight text-text-main">{time.nome}</span>
            </Link>
          ))}
            <button
              type="button"
              onClick={() => setShowAllTimes((current) => !current)}
              aria-expanded={showAllTimes}
              aria-controls="todos-times-panel"
              data-team-card
              className="group flex w-24 shrink-0 flex-col items-center rounded-2xl p-2 text-center transition-colors hover:bg-primary/5 sm:w-[92px]"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-card-bg p-2 text-primary shadow-card transition-transform group-hover:scale-105">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <rect x="4" y="4" width="6" height="6" rx="1" />
                  <rect x="14" y="4" width="6" height="6" rx="1" />
                  <rect x="4" y="14" width="6" height="6" rx="1" />
                  <rect x="14" y="14" width="6" height="6" rx="1" />
                </svg>
              </span>
              <span className="mt-2 text-xs font-bold leading-tight text-text-main">{showAllTimes ? "Ocultar times" : "Ver todos"}</span>
            </button>
            <span aria-hidden="true" className="w-full shrink-0" />
          </nav>
          {timesCanScrollLeft && (
            <button
              type="button"
              onClick={() => scrollTimes(-1)}
              className="group pointer-events-auto absolute left-[15px] top-12 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card-bg/95 text-primary shadow-card backdrop-blur-sm transition-[transform,background-color,color] duration-200 ease-out hover:scale-105 active:scale-95 hover:bg-primary hover:text-white focus-visible:scale-105 focus-visible:bg-primary focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 sm:left-1"
              aria-label="Voltar times"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 ease-out group-hover:-translate-x-1 group-focus-visible:-translate-x-1" aria-hidden="true">
                <path d="m15 5-7 7 7 7" />
              </svg>
            </button>
          )}
          {timesCanScroll && (
            <button
              type="button"
              onClick={() => scrollTimes(1)}
              className="group pointer-events-auto absolute right-[15px] top-12 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card-bg/95 text-primary shadow-card backdrop-blur-sm transition-[transform,background-color,color] duration-200 ease-out hover:scale-105 active:scale-95 hover:bg-primary hover:text-white focus-visible:scale-105 focus-visible:bg-primary focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 sm:right-1"
              aria-label="Ver mais times"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1" aria-hidden="true">
                <path d="m9 5 7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        {showAllTimes && (
          <div id="todos-times-panel" className="mt-4 rounded-2xl border border-border bg-bg-base p-4" aria-labelledby="todos-times-title">
            <h3 id="todos-times-title" className="text-sm font-semibold text-primary">Todos os times</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {todosTimes.map((time) => (
                <Link
                  key={time}
                  to={`/?time=${encodeURIComponent(time)}#catalogo`}
                  onClick={() => setShowAllTimes(false)}
                  className="rounded-xl border border-border bg-card-bg px-3 py-2 text-sm font-medium text-text-main transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  {time}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-12 pt-4 sm:px-6 lg:px-8" id="catalogo">
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
              <option value="time">Times em destaque</option>
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
              className="col-span-2 flex h-11 w-11 shrink-0 items-center justify-center self-end whitespace-nowrap rounded-lg border border-accent p-0 text-xs font-bold text-accent hover:bg-accent/10 sm:col-span-1"
              onClick={async () => {
                const url = window.location.href;
                try {
                  if (typeof navigator.share === "function") {
                    await navigator.share({
                      title: "RM Imports",
                      text: "Confira estes produtos na RM Imports",
                      url,
                    });
                    setShareFeedback("Compartilhado!");
                    return;
                  }

                  await navigator.clipboard.writeText(url);
                  setShareFeedback("Link copiado!");
                } catch (error) {
                  if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return;
                  setShareFeedback("Não foi possível compartilhar.");
                }
              }}
              aria-label="Compartilhar filtros"
              title="Compartilhar filtros"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.59 13.51 6.83 3.98" />
                <path d="m15.41 6.51-6.82 3.98" />
              </svg>
            </button>
            {shareFeedback && (
              <span className="self-center text-[10px] sm:text-xs text-accent" role="status" aria-live="polite">
                {shareFeedback}
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
            const priceInfo = getPrecoProduto(p.tipo, config, p.preco_customizado, (p.promocao_tipo as PromocaoTipo) ?? undefined, p.promocao_valor, p.time, p.temporada);
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

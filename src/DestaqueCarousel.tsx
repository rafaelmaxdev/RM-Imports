import { useState, useEffect, useRef, useCallback } from "react";
import type { DbProduto } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import type { LojaConfig, PromocaoTipo } from "./types";
import { getPrecoProduto, formatarMoeda, getCachedImageUrl } from "./types";

interface DestaqueCarouselProps {
  produtos: DbProduto[];
  config: LojaConfig;
  onSelect: (produto: DbProduto) => void;
}

function Marquee({ direction }: { direction: "left" | "right" }) {
  const text = "DESTAQUES E PROMOÇÕES\u00A0\u00A0\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0\u00A0\u00A0";
  const repeated = Array(20).fill(text).join("");
  const content = (
    <span className="whitespace-nowrap text-xs sm:text-base font-black tracking-[0.15em] sm:tracking-[0.25em] uppercase text-white/90" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {repeated}
    </span>
  );

  return (
    <div className="overflow-hidden bg-primary py-1.5 sm:py-2.5">
      <div className={direction === "left" ? "animate-marquee-left" : "animate-marquee-right"} style={{ display: "flex", width: "max-content" }}>
        {content}
        {content}
      </div>
    </div>
  );
}

const CARD_WIDTH_MOBILE = 175;
const CARD_WIDTH_DESKTOP = 220;
const CARD_GAP = 20;

export default function DestaqueCarousel({ produtos, config, onSelect }: DestaqueCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Touch/drag state
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const isDragging = useRef(false);
  const dragOffset = useRef(0);

  // Measure container
  useEffect(() => {
    const measure = () => {
      if (trackRef.current?.parentElement) {
        setContainerWidth(trackRef.current.parentElement.clientWidth);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const isMobile = containerWidth < 640;
  const cardWidth = isMobile ? CARD_WIDTH_MOBILE : CARD_WIDTH_DESKTOP;
  const visibleCards = Math.max(1, Math.floor((containerWidth - 32) / (cardWidth + CARD_GAP)));
  const maxIndex = Math.max(0, produtos.length - visibleCards);

  // Clamp index when produtos change
  useEffect(() => {
    if (currentIndex > maxIndex) {
      setCurrentIndex(Math.max(0, maxIndex));
    }
  }, [produtos.length, maxIndex, currentIndex]);

  // Auto-advance
  useEffect(() => {
    if (produtos.length <= visibleCards) return;

    autoPlayRef.current = setInterval(() => {
      if (isPaused || isDragging.current) return;
      setIsTransitioning(true);
      setCurrentIndex((prev) => {
        if (prev >= maxIndex) return 0;
        return prev + 1;
      });
    }, 4500);

    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [produtos.length, visibleCards, maxIndex, isPaused]);

  // Clear transitioning flag after animation
  useEffect(() => {
    if (!isTransitioning) return;
    const t = setTimeout(() => setIsTransitioning(false), 500);
    return () => clearTimeout(t);
  }, [isTransitioning, currentIndex]);

  const goTo = useCallback((idx: number) => {
    setIsTransitioning(true);
    setCurrentIndex(Math.max(0, Math.min(idx, maxIndex)));
  }, [maxIndex]);

  const goPrev = useCallback(() => {
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev <= 0 ? maxIndex : prev - 1);
  }, [maxIndex]);

  const goNext = useCallback(() => {
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev >= maxIndex ? 0 : prev + 1);
  }, [maxIndex]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    isDragging.current = true;
    dragOffset.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchCurrentX.current = e.touches[0].clientX;
    dragOffset.current = touchCurrentX.current - touchStartX.current;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const diff = dragOffset.current;
    dragOffset.current = 0;

    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        goPrev();
      } else {
        goNext();
      }
    }
  }, [goPrev, goNext]);

  // Mouse drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    touchStartX.current = e.clientX;
    touchCurrentX.current = e.clientX;
    isDragging.current = true;
    dragOffset.current = 0;
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    touchCurrentX.current = e.clientX;
    dragOffset.current = touchCurrentX.current - touchStartX.current;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const diff = dragOffset.current;
    dragOffset.current = 0;

    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        goPrev();
      } else {
        goNext();
      }
    }
  }, [goPrev, goNext]);

  if (produtos.length === 0) return null;

  const canScrollLeft = currentIndex > 0 || produtos.length > visibleCards;
  const canScrollRight = currentIndex < maxIndex || produtos.length > visibleCards;
  const needsScroll = produtos.length > visibleCards;
  const offset = currentIndex * (cardWidth + CARD_GAP);

  return (
    <section className="mb-0">
      <Marquee direction="left" />

      <div
        className="relative bg-[#0f1629] py-4 sm:py-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => { setIsPaused(false); isDragging.current = false; }}
      >
        {/* Arrows */}
        {needsScroll && canScrollLeft && (
          <button
            onClick={goPrev}
            className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-10 sm:h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center cursor-pointer border-none transition-colors"
            aria-label="Anterior"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        )}
        {needsScroll && canScrollRight && (
          <button
            onClick={goNext}
            className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-10 sm:h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center cursor-pointer border-none transition-colors"
            aria-label="Próximo"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        )}

        <div
          className="overflow-hidden px-3 sm:px-4 cursor-grab active:cursor-grabbing select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (isDragging.current) { isDragging.current = false; dragOffset.current = 0; } }}
        >
          <div
            ref={trackRef}
            className="flex gap-5"
            style={{
              transform: `translateX(-${offset}px)`,
              transition: isTransitioning ? "transform 500ms cubic-bezier(0.25, 0.1, 0.25, 1)" : "none",
              justifyContent: !needsScroll ? "center" : undefined,
            }}
          >
            {produtos.map((p, index) => {
              const imgs = parseImageUrls(p.imagem_urls);
              const img = imgs.length > 0 ? getCachedImageUrl(imgs[0], p.cached_image_urls, 0, "medium") : "";
              const { base, promo, emPromocao, badge, discountLabel } = getPrecoProduto(p.tipo, config, p.preco_customizado, (p.promocao_tipo as PromocaoTipo) ?? undefined, p.promocao_valor);

              return (
                <div
                  key={p.id}
                  className="product-card-hover flex-shrink-0 bg-white rounded-lg overflow-hidden shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer relative group flex flex-col"
                  style={{ width: `${cardWidth}px` }}
                  onClick={() => onSelect(p)}
                >
                  {emPromocao && (
                    <span className="animate-promo-pulse absolute top-2 right-2 bg-accent text-white text-[10px] font-extrabold px-2 py-0.5 rounded-sm shadow-md uppercase tracking-wider z-10">
                      {badge || "PROMO"}
                    </span>
                  )}
                  {p.destaque && (
                    <span className="absolute top-2 left-2 bg-yellow-400 text-primary text-[10px] font-extrabold px-2 py-0.5 rounded-sm shadow-md uppercase tracking-wider z-10">
                      ★ DESTAQUE
                    </span>
                  )}

                  <div className="aspect-square bg-gray-100 overflow-hidden">
                    {img ? (
                      <img src={img} alt={p.nome} width={220} height={220} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">Sem imagem</div>
                    )}
                  </div>

                  <div className="p-2 sm:p-3 flex flex-col flex-1">
                    <div className="font-semibold text-xs sm:text-sm line-clamp-2 mb-1 sm:mb-1.5">{p.nome}</div>
                    <div className="flex gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
                      <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 bg-primary text-white rounded">{p.tipo}</span>
                      <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 bg-primary text-white rounded">{p.temporada}</span>
                    </div>
                    <div className="mt-auto">
                      {promo !== null ? (
                        <div>
                          <div className="flex items-baseline gap-1 sm:gap-2">
                            <span className="font-bold text-accent text-sm sm:text-base">{formatarMoeda(promo)}</span>
                            <span className="text-text-muted text-[10px] sm:text-xs line-through">{formatarMoeda(base)}</span>
                          </div>
                          {badge && (
                            <span className="inline-block mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] font-extrabold px-1.5 sm:px-2 py-0.5 bg-accent/15 text-accent rounded-sm uppercase tracking-wider">
                              {discountLabel || badge}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="font-bold text-accent text-sm sm:text-base">{formatarMoeda(base)}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dots indicator */}
        {needsScroll && (
          <div className="flex justify-center gap-1.5 mt-2 sm:mt-4">
            {Array.from({ length: maxIndex + 1 }, (_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`w-2 h-2 rounded-full cursor-pointer transition-all ${
                  i === currentIndex ? "bg-white scale-125" : "bg-white/40 hover:bg-white/60"
                }`}
                aria-label={`Ir para ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <Marquee direction="right" />
    </section>
  );
}
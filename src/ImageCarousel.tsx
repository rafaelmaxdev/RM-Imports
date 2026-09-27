import { useState, useRef, useCallback, useEffect, memo, type CSSProperties } from "react";
import { type CachedImageMap, getCachedImageUrl } from "./types";

interface ImageCarouselProps {
  images: string[];
  alt: string;
  /** Extra CSS class for the outer container */
  className?: string;
  /** Called when user clicks an image; receives current image index */
  onImageClick?: (index: number) => void;
  /** Pre-cached image URLs for the product images */
  cachedImageUrls?: CachedImageMap | null;
  /** Enables cursor-positioned zoom on fine-pointer devices */
  hoverZoom?: boolean;
}

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3ESem imagem%3C/text%3E%3C/svg%3E";

const ERROR_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3EErro%3C/text%3E%3C/svg%3E";

/** Skeleton placeholder while image loads.
 *  Retries once on error (handles transient mobile network failures). */
function ImageWithLoader({
  src,
  alt,
  className,
  loading,
  fetchPriority,
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  style?: CSSProperties;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [retrySrc, setRetrySrc] = useState<string | null>(null);

  const handleError = useCallback(() => {
    // Retry once with a cache-busting parameter to bypass stale CDN/browser cache
    if (!retrySrc) {
      const separator = src.includes("?") ? "&" : "?";
      setRetrySrc(`${src}${separator}_retry=${Date.now()}`);
    } else {
      setErrored(true);
    }
  }, [retrySrc, src]);

  if (errored) {
    return (
      <img
        src={ERROR_IMG}
        alt={alt}
        width={200}
        height={200}
        className={className}
        style={style}
        draggable={false}
      />
    );
  }

  const imgSrc = retrySrc || src;

  return (
    <>
      {/* Skeleton placeholder shown while image loads */}
      {!loaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-sm" />
      )}
      <img
        src={imgSrc}
        alt={alt}
        width={400}
        height={400}
        className={`${className} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        loading={loading}
        decoding="async"
        draggable={false}
        fetchPriority={fetchPriority}
        style={style}
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
    </>
  );
}

export default memo(function ImageCarousel({
  images,
  alt,
  className = "",
  onImageClick,
  cachedImageUrls,
  hoverZoom = false,
}: ImageCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [mobileDotsOverflow, setMobileDotsOverflow] = useState(false);
  const [showSwipeIndicator, setShowSwipeIndicator] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const mobileDotsRef = useRef<HTMLDivElement>(null);
  const swipeIndicatorTimer = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const [zoomStyle, setZoomStyle] = useState<CSSProperties>({
    transform: "scale(1)",
    transformOrigin: "50% 50%",
    transition: "transform 450ms ease-in-out",
  });

  const validImages = images.filter(Boolean);

  const prev = useCallback(() => {
    setCurrent((c) => (c > 0 ? c - 1 : validImages.length - 1));
  }, [validImages.length]);

  const next = useCallback(() => {
    setCurrent((c) => (c < validImages.length - 1 ? c + 1 : 0));
  }, [validImages.length]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hoverZoom || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const transition = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "none"
      : "transform 450ms ease-in-out";

    setZoomStyle({
      transform: "scale(1.55)",
      transformOrigin: `${x}% ${y}%`,
      transition,
    });
  };

  const handleMouseLeave = () => {
    if (!hoverZoom) return;

    setZoomStyle({
      transform: "scale(1)",
      transformOrigin: "50% 50%",
      transition: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "none"
        : "transform 450ms ease-in-out",
    });
  };

  useEffect(() => {
    const viewport = mobileDotsRef.current;
    if (!viewport) {
      setMobileDotsOverflow(false);
      return;
    }

    const updateOverflow = () => {
      setMobileDotsOverflow(viewport.scrollWidth > viewport.clientWidth + 1);
    };

    updateOverflow();
    window.addEventListener("resize", updateOverflow);
    return () => window.removeEventListener("resize", updateOverflow);
  }, [validImages.length]);

  useEffect(() => {
    const viewport = mobileDotsRef.current;
    const dot = viewport?.querySelector<HTMLElement>(`[data-mobile-dot="${current}"]`);
    if (!viewport || !dot) return;

    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const centeredScroll = dot.offsetLeft + dot.offsetWidth / 2 - viewport.clientWidth / 2;
    viewport.scrollTo({
      left: Math.max(0, Math.min(centeredScroll, maxScroll)),
      behavior: "smooth",
    });
  }, [current, validImages.length]);

  const revealSwipeIndicator = useCallback(() => {
    setShowSwipeIndicator(true);
    if (swipeIndicatorTimer.current !== null) {
      window.clearTimeout(swipeIndicatorTimer.current);
    }
    swipeIndicatorTimer.current = window.setTimeout(() => {
      setShowSwipeIndicator(false);
      swipeIndicatorTimer.current = null;
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (swipeIndicatorTimer.current !== null) {
        window.clearTimeout(swipeIndicatorTimer.current);
      }
    };
  }, []);

  /* ---- No images ---- */
  if (validImages.length === 0) {
    return (
      <div className={`aspect-square bg-gray-100 overflow-hidden ${className}`}>
        <img src={PLACEHOLDER} alt={alt} width={200} height={200} className="w-full h-full object-cover" />
      </div>
    );
  }

  /* ---- Single image ---- */
  if (validImages.length === 1) {
    return (
      <div
        className={`aspect-square bg-gray-100 overflow-hidden relative cursor-zoom-in ${className}`}
        onMouseMove={hoverZoom ? handleMouseMove : undefined}
        onMouseLeave={hoverZoom ? handleMouseLeave : undefined}
        onClick={() => onImageClick?.(0)}
      >
        <ImageWithLoader
          src={getCachedImageUrl(validImages[0], cachedImageUrls, 0, "medium")}
          alt={alt}
          className="w-full h-full object-cover"
          style={hoverZoom ? zoomStyle : undefined}
          loading="eager"
          fetchPriority="high"
        />
      </div>
    );
  }

  /* ---- Multiple images ---- */
  const handleTouchStart = (e: React.TouchEvent) => {
    didSwipe.current = false;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = touchStartY.current !== null
      ? Math.abs(touchStartY.current - e.changedTouches[0].clientY)
      : 0;
    // Only register horizontal swipes (avoid interfering with vertical scroll)
    if (Math.abs(dx) > 40 && Math.abs(dx) > dy) {
      didSwipe.current = true;
      if (dx > 0) next(); else prev();
      revealSwipeIndicator();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  /**
   * Only load images that are the current slide or adjacent (±1).
   * Other slides use a transparent placeholder to avoid unnecessary downloads.
   */
  const shouldLoad = (index: number) => {
    const diff = Math.abs(index - current);
    // Wrap-around distance for circular carousel
    const wrapDiff = validImages.length - diff;
    return diff <= 1 || wrapDiff <= 1;
  };

  return (
    <div
      className={`relative aspect-square bg-gray-100 overflow-hidden group cursor-zoom-in ${className}`}
      onMouseMove={hoverZoom ? handleMouseMove : undefined}
      onMouseLeave={hoverZoom ? handleMouseLeave : undefined}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        if (didSwipe.current) {
          didSwipe.current = false;
          return;
        }
        onImageClick?.(current);
      }}
    >
      {/* Sliding track */}
      <div
        className="flex h-full transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
        style={{ transform: `translate3d(-${current * 100}%, 0, 0)` }}
      >
        {validImages.map((url, i) => (
          <div key={i} className="w-full h-full flex-shrink-0 relative overflow-hidden">
            {shouldLoad(i) ? (
              <ImageWithLoader
                src={getCachedImageUrl(url, cachedImageUrls, i, "medium")}
                alt={`${alt} ${i + 1}`}
                className="w-full h-full object-cover select-none"
                style={hoverZoom && i === current ? zoomStyle : undefined}
                loading={i === current ? "eager" : "lazy"}
                fetchPriority={i === current ? "high" : "auto"}
              />
            ) : (
              <div className="w-full h-full bg-gray-100" />
            )}
          </div>
        ))}
      </div>

      {/* Gradient overlay at bottom for dot visibility */}
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />

      {/* Left arrow */}
      <button
        onClick={(e) => { e.stopPropagation(); prev(); }}
        className="absolute left-1 top-1/2 -translate-y-1/2 hidden sm:flex w-11 h-11 bg-white/85 hover:bg-white rounded-full items-center justify-center shadow-md sm:left-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer z-30"
        aria-label="Imagem anterior"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Right arrow */}
      <button
        onClick={(e) => { e.stopPropagation(); next(); }}
        className="absolute right-1 top-1/2 -translate-y-1/2 hidden sm:flex w-11 h-11 bg-white/85 hover:bg-white rounded-full items-center justify-center shadow-md sm:right-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer z-30"
        aria-label="Próxima imagem"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {showSwipeIndicator && (
        <div className="pointer-events-none absolute right-2 top-2 z-30 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white sm:hidden">
          {current + 1} / {validImages.length}
        </div>
      )}

      {/* Mobile dot viewport */}
      <div
        ref={mobileDotsRef}
        className="absolute bottom-2 left-1/2 z-30 flex w-full max-w-[calc(100%_-_1rem)] -translate-x-1/2 overflow-hidden sm:hidden"
        style={mobileDotsOverflow && current < validImages.length - 1
          ? {
              maskImage: "linear-gradient(to right, black calc(100% - 1.25rem), transparent)",
              WebkitMaskImage: "linear-gradient(to right, black calc(100% - 1.25rem), transparent)",
            }
          : undefined}
      >
        <div className="flex w-max min-w-full shrink-0 items-center justify-center gap-0">
          {validImages.map((_, i) => (
            <button
              key={i}
              type="button"
              data-mobile-dot={i}
              onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
              className={`shrink-0 rounded-full p-1.5 transition-all duration-200 cursor-pointer ${
                i === current
                  ? "text-white scale-125"
                  : "text-white/60 hover:text-white/80"
              }`}
              aria-label={`Ir para imagem ${i + 1}`}
            >
              <span className="block h-1.5 w-1.5 rounded-full bg-current" />
            </button>
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-2 left-1/2 hidden sm:flex z-30 -translate-x-1/2 gap-0">
        {validImages.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
            className={`p-2.5 rounded-full transition-all duration-200 cursor-pointer ${
              i === current
                ? "text-white scale-125"
                : "text-white/60 hover:text-white/80"
            }`}
            aria-label={`Ir para imagem ${i + 1}`}
          >
            <span className={`block w-2 h-2 rounded-full bg-current`} />
          </button>
        ))}
      </div>
    </div>
);
});

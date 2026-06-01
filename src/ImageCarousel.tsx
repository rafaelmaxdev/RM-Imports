import { useState, useRef, useCallback, memo } from "react";
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
}

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3ESem imagem%3C/text%3E%3C/svg%3E";

const ERROR_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3EErro%3C/text%3E%3C/svg%3E";

/** Skeleton placeholder while image loads */
function ImageWithLoader({
  src,
  alt,
  className,
  loading,
  fetchPriority,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <img
        src={ERROR_IMG}
        alt={alt}
        className={className}
        draggable={false}
      />
    );
  }

  return (
    <>
      {/* Skeleton placeholder shown while image loads */}
      {!loaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-sm" />
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        loading={loading}
        decoding="async"
        draggable={false}
        fetchPriority={fetchPriority}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
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
}: ImageCarouselProps) {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const validImages = images.filter(Boolean);

  /* ---- No images ---- */
  if (validImages.length === 0) {
    return (
      <div className={`aspect-square bg-gray-100 overflow-hidden ${className}`}>
        <img src={PLACEHOLDER} alt={alt} className="w-full h-full object-cover" />
      </div>
    );
  }

  /* ---- Single image ---- */
  if (validImages.length === 1) {
    return (
      <div
        className={`aspect-square bg-gray-100 overflow-hidden relative cursor-zoom-in ${className}`}
        onClick={() => onImageClick?.(0)}
      >
        <ImageWithLoader
          src={getCachedImageUrl(validImages[0], cachedImageUrls, 0, "medium")}
          alt={alt}
          className="w-full h-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
      </div>
    );
  }

  /* ---- Multiple images ---- */
  const prev = useCallback(() => {
    setCurrent((c) => (c > 0 ? c - 1 : validImages.length - 1));
  }, [validImages.length]);

  const next = useCallback(() => {
    setCurrent((c) => (c < validImages.length - 1 ? c + 1 : 0));
  }, [validImages.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
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
      dx > 0 ? next() : prev();
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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => onImageClick?.(current)}
    >
      {/* Sliding track */}
      <div
        className="flex h-full transition-transform duration-300 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {validImages.map((url, i) => (
          <div key={i} className="w-full h-full flex-shrink-0 relative">
            {shouldLoad(i) ? (
              <ImageWithLoader
                src={getCachedImageUrl(url, cachedImageUrls, i, "medium")}
                alt={`${alt} ${i + 1}`}
                className="w-full h-full object-cover select-none"
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
        className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/85 hover:bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
        aria-label="Imagem anterior"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Right arrow */}
      <button
        onClick={(e) => { e.stopPropagation(); next(); }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/85 hover:bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
        aria-label="Próxima imagem"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
        {validImages.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
            className={`w-2 h-2 rounded-full transition-all duration-200 cursor-pointer ${
              i === current
                ? "bg-white scale-125 shadow-sm"
                : "bg-white/60 hover:bg-white/80"
            }`}
            aria-label={`Ir para imagem ${i + 1}`}
          />
        ))}
      </div>
    </div>
);
});
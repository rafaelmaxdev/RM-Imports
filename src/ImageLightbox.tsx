import { useState, useEffect, useCallback } from "react";
import { type CachedImageMap, getCachedImageUrl } from "./types";
import useBodyScrollLock from "./hooks/useBodyScrollLock";

interface ImageLightboxProps {
  images: string[];
  alt: string;
  initialIndex: number;
  onClose: () => void;
  cachedImageUrls?: CachedImageMap | null;
}

export default function ImageLightbox({ images, alt, initialIndex, onClose, cachedImageUrls }: ImageLightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [retryKey, setRetryKey] = useState(0);
  const validImages = images.filter(Boolean);

  const goNext = useCallback(() => {
    setCurrent((c) => (c < validImages.length - 1 ? c + 1 : 0));
    setRetryKey(0);
  }, [validImages.length]);

  const goPrev = useCallback(() => {
    setCurrent((c) => (c > 0 ? c - 1 : validImages.length - 1));
    setRetryKey(0);
  }, [validImages.length]);

  useBodyScrollLock(true);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, goNext, goPrev]);

  if (validImages.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl cursor-pointer transition-colors z-10 border-none"
        onClick={onClose}
        aria-label="Fechar"
      >
        ✕
      </button>

      {/* Image counter */}
      {validImages.length > 1 && (
        <div className="absolute top-4 left-4 text-white/70 text-sm font-medium z-10">
          {current + 1} / {validImages.length}
        </div>
      )}

      {/* Image */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
          <img
            src={getCachedImageUrl(validImages[current], cachedImageUrls, current, "large") + (retryKey > 0 ? `&_retry=${retryKey}` : "")}
            alt={`${alt} ${current + 1}`}
            width={800}
            height={800}
            className="max-w-full max-h-[85vh] object-contain select-none rounded-sm"
            decoding="async"
            draggable={false}
            onError={() => { if (retryKey === 0) setRetryKey(Date.now()); }}
          />
      </div>

      {/* Navigation arrows */}
      {validImages.length > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/10 hover:bg-white/25 rounded-full flex items-center justify-center text-white cursor-pointer transition-colors z-10 border-none"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label="Imagem anterior"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/10 hover:bg-white/25 rounded-full flex items-center justify-center text-white cursor-pointer transition-colors z-10 border-none"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label="Próxima imagem"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-0 z-10">
            {validImages.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                className={`p-2.5 rounded-full transition-all duration-200 cursor-pointer border-none ${
                  i === current
                    ? "text-white scale-125"
                    : "text-white/50 hover:text-white/70"
                }`}
                aria-label={`Ir para imagem ${i + 1}`}
              >
                <span className={`block w-2.5 h-2.5 rounded-full bg-current`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
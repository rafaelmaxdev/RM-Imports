import { useState, useEffect, useCallback } from "react";
import { yupooThumbnailUrl } from "./types";

interface ImageLightboxProps {
  images: string[];
  alt: string;
  initialIndex: number;
  onClose: () => void;
}

export default function ImageLightbox({ images, alt, initialIndex, onClose }: ImageLightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const validImages = images.filter(Boolean);

  const goNext = useCallback(() => {
    setCurrent((c) => (c < validImages.length - 1 ? c + 1 : 0));
  }, [validImages.length]);

  const goPrev = useCallback(() => {
    setCurrent((c) => (c > 0 ? c - 1 : validImages.length - 1));
  }, [validImages.length]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
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
            src={yupooThumbnailUrl(validImages[current], "medium")}
            alt={`${alt} ${current + 1}`}
            className="max-w-full max-h-[85vh] object-contain select-none rounded-sm"
            decoding="async"
            draggable={false}
          />
      </div>

      {/* Navigation arrows */}
      {validImages.length > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/25 rounded-full flex items-center justify-center text-white cursor-pointer transition-colors z-10 border-none"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label="Imagem anterior"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/25 rounded-full flex items-center justify-center text-white cursor-pointer transition-colors z-10 border-none"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label="Próxima imagem"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {validImages.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-200 cursor-pointer border-none ${
                  i === current
                    ? "bg-white scale-125"
                    : "bg-white/50 hover:bg-white/70"
                }`}
                aria-label={`Ir para imagem ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
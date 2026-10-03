import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { type CachedImageMap, getCachedImageUrl } from "./types";
import useBodyScrollLock from "./hooks/useBodyScrollLock";

interface Position {
  x: number;
  y: number;
}

function getTouchDistance(first: { clientX: number; clientY: number }, second: { clientX: number; clientY: number }) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampPosition(position: Position, scale: number, container: HTMLElement): Position {
  const maxX = container.clientWidth * (scale - 1) / 2;
  const maxY = container.clientHeight * (scale - 1) / 2;

  return {
    x: clamp(position.x, -maxX, maxX),
    y: clamp(position.y, -maxY, maxY),
  };
}

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
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const validImages = images.filter(Boolean);

  const singleTouchStartRef = useRef<Position | null>(null);
  const panStartRef = useRef<Position>({ x: 0, y: 0 });
  const pinchStartDistanceRef = useRef(0);
  const pinchStartScaleRef = useRef(1);
  const lastTapRef = useRef(0);
  const touchMovedRef = useRef(false);
  const scaleRef = useRef(1);
  const positionRef = useRef<Position>({ x: 0, y: 0 });

  const resetZoom = useCallback(() => {
    const resetPosition = { x: 0, y: 0 };
    scaleRef.current = 1;
    positionRef.current = resetPosition;
    setScale(1);
    setPosition(resetPosition);
    lastTapRef.current = 0;
  }, []);

  const goNext = useCallback(() => {
    resetZoom();
    setCurrent((c) => (c < validImages.length - 1 ? c + 1 : 0));
    setRetryKey(0);
  }, [resetZoom, validImages.length]);

  const goPrev = useCallback(() => {
    resetZoom();
    setCurrent((c) => (c > 0 ? c - 1 : validImages.length - 1));
    setRetryKey(0);
  }, [resetZoom, validImages.length]);

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    event.stopPropagation();
    setIsInteracting(true);

    if (event.touches.length >= 2) {
      singleTouchStartRef.current = null;
      touchMovedRef.current = true;
      pinchStartDistanceRef.current = getTouchDistance(event.touches[0], event.touches[1]);
      pinchStartScaleRef.current = scaleRef.current;
      panStartRef.current = positionRef.current;
      return;
    }

    const touch = event.touches[0];
    singleTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    panStartRef.current = positionRef.current;
    touchMovedRef.current = false;
    pinchStartDistanceRef.current = 0;
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    event.stopPropagation();

    if (event.touches.length >= 2) {
      event.preventDefault();
      touchMovedRef.current = true;
      const distance = getTouchDistance(event.touches[0], event.touches[1]);
      const startDistance = pinchStartDistanceRef.current;
      if (!startDistance) return;

      const nextScale = clamp(pinchStartScaleRef.current * distance / startDistance, 1, 4);
      scaleRef.current = nextScale;
      setScale(nextScale);

      const nextPosition = nextScale === 1
        ? { x: 0, y: 0 }
        : clampPosition(positionRef.current, nextScale, event.currentTarget);
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      return;
    }

    if (event.touches.length !== 1) return;

    const start = singleTouchStartRef.current;
    if (!start) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) touchMovedRef.current = true;
    if (scaleRef.current <= 1) return;

    event.preventDefault();
    const nextPosition = clampPosition({
      x: panStartRef.current.x + deltaX,
      y: panStartRef.current.y + deltaY,
    }, scaleRef.current, event.currentTarget);
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    event.stopPropagation();

    if (event.touches.length > 0) {
      if (event.touches.length === 1 && scaleRef.current > 1) {
        const touch = event.touches[0];
        singleTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
        panStartRef.current = positionRef.current;
      }
      return;
    }

    setIsInteracting(false);
    const start = singleTouchStartRef.current;
    const end = event.changedTouches[0];
    singleTouchStartRef.current = null;
    if (!start || !end) return;

    const deltaX = end.clientX - start.x;
    const deltaY = end.clientY - start.y;
    const isTap = !touchMovedRef.current && Math.abs(deltaX) <= 10 && Math.abs(deltaY) <= 10;
    const currentScale = scaleRef.current;

    if (currentScale === 1 && Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      lastTapRef.current = 0;
      if (deltaX < 0) goNext();
      else goPrev();
      return;
    }

    if (!isTap) {
      lastTapRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const nextScale = currentScale === 1 ? 2 : 1;
      const nextPosition = { x: 0, y: 0 };
      scaleRef.current = nextScale;
      positionRef.current = nextPosition;
      setScale(nextScale);
      setPosition(nextPosition);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }

  function handleTouchCancel(event: React.TouchEvent<HTMLDivElement>) {
    event.stopPropagation();
    setIsInteracting(false);
    singleTouchStartRef.current = null;
    touchMovedRef.current = true;
    lastTapRef.current = 0;
  }

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

  return createPortal(
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
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center touch-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
          <img
            src={getCachedImageUrl(validImages[current], cachedImageUrls, current, "large") + (retryKey > 0 ? `&_retry=${retryKey}` : "")}
            alt={`${alt} ${current + 1}`}
            width={800}
            height={800}
            className="max-w-full max-h-[85vh] object-contain select-none rounded-sm will-change-transform"
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
              transformOrigin: "center",
              transition: isInteracting ? "none" : "transform 250ms ease-in-out",
            }}
            decoding="async"
            draggable={false}
            onError={() => { if (retryKey === 0) setRetryKey(Date.now()); }}
          />
      </div>

      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/50 text-xs sm:hidden pointer-events-none z-10 whitespace-nowrap">
        Use dois dedos para ampliar
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
                onClick={(e) => { e.stopPropagation(); resetZoom(); setCurrent(i); }}
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
    </div>,
    document.body,
  );
}

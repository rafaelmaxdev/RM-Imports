import { useLayoutEffect } from "react";

/**
 * Reference counter for active scroll locks.
 * Ensures body scroll is only unlocked when ALL locks are released,
 * preventing conflicts when multiple modals/overlays are open simultaneously.
 */
let lockCount = 0;
let savedState: {
  scrollY: number;
  overflow: string;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  paddingRight: string;
  overscrollBehavior: string;
} | null = null;

/**
 * Locks body scroll when `isLocked` is true.
 * Uses reference counting so multiple modals can safely lock/unlock independently.
 */
export default function useBodyScrollLock(isLocked: boolean) {
  useLayoutEffect(() => {
    if (!isLocked) return;

    if (lockCount === 0) {
      const { body, documentElement } = document;
      savedState = {
        scrollY: window.scrollY,
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        paddingRight: body.style.paddingRight,
        overscrollBehavior: documentElement.style.overscrollBehavior,
      };

      const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
      body.style.overflow = "hidden";
      // Fixed positioning prevents iOS Safari from scrolling behind the modal.
      body.style.position = "fixed";
      body.style.top = `-${savedState.scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
      documentElement.style.overscrollBehavior = "none";
    }

    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount !== 0 || !savedState) return;

      const { body, documentElement } = document;
      body.style.overflow = savedState.overflow;
      body.style.position = savedState.position;
      body.style.top = savedState.top;
      body.style.left = savedState.left;
      body.style.right = savedState.right;
      body.style.width = savedState.width;
      body.style.paddingRight = savedState.paddingRight;
      documentElement.style.overscrollBehavior = savedState.overscrollBehavior;
      window.scrollTo(0, savedState.scrollY);
      savedState = null;
    };
  }, [isLocked]);
}

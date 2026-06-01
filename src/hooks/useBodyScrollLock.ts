import { useEffect } from "react";

/**
 * Reference counter for active scroll locks.
 * Ensures body scroll is only unlocked when ALL locks are released,
 * preventing conflicts when multiple modals/overlays are open simultaneously.
 */
let lockCount = 0;

/**
 * Locks body scroll when `isLocked` is true.
 * Uses reference counting so multiple modals can safely lock/unlock independently.
 */
export default function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (isLocked) {
      lockCount++;
      document.body.style.overflow = "hidden";
      return () => {
        lockCount--;
        if (lockCount <= 0) {
          lockCount = 0;
          document.body.style.overflow = "";
        }
      };
    }
  }, [isLocked]);
}
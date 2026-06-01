import { useEffect } from "react";

/**
 * Locks body scroll when `isLocked` is true.
 * Prevents scrolling behind modals, lightboxes, and sidebars.
 */
export default function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (isLocked) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isLocked]);
}

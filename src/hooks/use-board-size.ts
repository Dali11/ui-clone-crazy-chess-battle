"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measures a container element and returns the largest square size that
 * fits within both its width and height — used to size the chessboard so
 * it never forces the page to scroll, on any screen size. Pass `factor`
 * (< 1) to render the board slightly smaller than the container.
 *
 * Snapped to a multiple of `cols` (default 8, for an 8x8 board): the
 * react-chessboard grid divides this size into `cols` equal columns via
 * CSS grid `1fr` tracks. If the pixel size isn't evenly divisible, each
 * column ends up a fractional width (e.g. 583px / 8 = 72.875px) and the
 * browser rounds sub-pixel boundaries inconsistently row to row — the
 * dark page background then peeks through as thin, distracting lines
 * between ranks. Snapping to a multiple of `cols` makes every square a
 * whole pixel, so there are no rounding seams at all.
 */
export function useBoardSize(maxSize = 600, minSize = 220, cols = 8, factor = 1) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(Math.floor(maxSize / cols) * cols);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      // `factor` lets callers render the board slightly smaller than the
      // available space (e.g. 0.92 = ~8% breathing room each side). On
      // phones the container is nearly the full viewport width, so at
      // factor 1 the squares came out ~55-56px edge-to-edge — visually
      // too heavy. A small scale-down gives the board a margin so it
      // reads as a contained element instead of spanning the screen.
      const fit = Math.floor(Math.min(rect.width, rect.height) * factor);
      if (fit > 0) {
        const clamped = Math.max(minSize, Math.min(maxSize, fit));
        // Round DOWN to the nearest multiple of `cols` so it never
        // exceeds the available space, then floor at minSize.
        const snapped = Math.max(cols, Math.floor(clamped / cols) * cols);
        setSize(snapped);
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [maxSize, minSize, cols, factor]);

  return { containerRef, size };
}

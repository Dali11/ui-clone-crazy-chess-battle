"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin top progress bar that fills on every route change.
 * Fires on pathname change — gives instant visual feedback
 * that the tap was registered, even before the new page renders.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Start a new navigation
    setLoading(true);
    setProgress(15);

    // Animate to ~90% quickly, then complete after a short delay
    const tick = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return p + Math.random() * 15;
      });
    }, 80);

    // Complete after the new page has had time to render
    const done = setTimeout(() => {
      setProgress(100);
      setTimeout(() => setLoading(false), 200);
    }, 400);

    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [pathname]);

  if (!loading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[300] pointer-events-none">
      <div
        className="h-0.5 bg-gradient-to-r from-ccb-primary to-ccb-accent transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

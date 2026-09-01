"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Download, X, Smartphone } from "lucide-react";

export default function AppBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    // Check if user already dismissed recently (sessionStorage)
    const dismissedAt = sessionStorage.getItem("app-banner-dismissed");
    if (dismissedAt) {
      setDismissed(true);
      return;
    }
    // Detect Android
    const ua = navigator.userAgent.toLowerCase();
    const isAndroid = ua.includes("android");
    // Detect if running inside the TWA already (no browser UA modifications)
    const isInApp = ua.includes("wv") || document.referrer.startsWith("android-app://");
    if (isAndroid && !isInApp) {
      setVisible(true);
    }
  }, [dismissed]);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem("app-banner-dismissed", Date.now().toString());
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-md animate-slide-up">
      <div className="bg-ccb-card border border-ccb-border sm:rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
          <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={40} height={40} className="rounded-xl" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Get the Crazy Chess Battles app</div>
          <div className="text-xs text-ccb-muted">Faster, smoother, native experience</div>
        </div>
        <Link
          href="/download"
          className="btn-primary text-xs px-3 py-2 shrink-0 flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          Get App
        </Link>
        <button
          onClick={dismiss}
          className="text-ccb-muted hover:text-ccb-text p-1 shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

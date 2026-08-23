"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ccb_pwa_dismissed_date";
const INSTALLED_KEY = "ccb_pwa_installed";

export default function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Check if already installed (standalone mode or previously marked)
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches ||
        (window.navigator as any).standalone === true;
      const markedInstalled = localStorage.getItem(INSTALLED_KEY) === "true";
      return isStandalone || markedInstalled;
    };

    if (checkInstalled()) return; // Already installed — never show

    // Listen for appinstalled event to permanently hide
    const handleInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, "true");
      setShowBanner(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handleInstalled);

    // Also listen for display-mode changes (covers cases where appinstalled doesn't fire)
    const mq = window.matchMedia("(display-mode: standalone)");
    const handleDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) handleInstalled();
    };
    mq.addEventListener("change", handleDisplayChange);

    // Check if already shown today
    const today = new Date().toDateString();
    const lastShown = localStorage.getItem(DISMISS_KEY);
    if (lastShown === today) return; // Already shown today

    // Detect iOS (no beforeinstallprompt support)
    const ua = window.navigator.userAgent;
    const iosDetected = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iosDetected);

    if (iosDetected) {
      // iOS doesn't support beforeinstallprompt — show manual instructions
      // But still respect once-a-day
      setShowBanner(true);
      localStorage.setItem(DISMISS_KEY, today);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Only show if not already shown today
      const todayDate = new Date().toDateString();
      const shown = localStorage.getItem(DISMISS_KEY);
      if (shown !== todayDate) {
        setShowBanner(true);
        localStorage.setItem(DISMISS_KEY, todayDate);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", handleInstalled);
      mq.removeEventListener("change", handleDisplayChange);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "true");
    }
    setShowBanner(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    // Record today's date so it doesn't show again until tomorrow
    localStorage.setItem(DISMISS_KEY, new Date().toDateString());
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-[calc(env(safe-area-inset-top)+3.5rem)] inset-x-4 sm:left-auto sm:right-4 sm:w-80 sm:top-[calc(env(safe-area-inset-top)+5rem)] z-[60] rounded-2xl border border-gray-700 bg-gray-900/95 backdrop-blur-md shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-top-4">
      <img src="/icon-96.png" alt="Crazy Chess Battles" className="w-11 h-11 rounded-xl flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-snug">Install Crazy Chess Battles</p>
        {isIOS ? (
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            Tap <span className="font-medium text-gray-300">Share</span> then{" "}
            <span className="font-medium text-gray-300">&quot;Add to Home Screen&quot;</span>
          </p>
        ) : (
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            Play faster, get notified about matches, no browser bar.
          </p>
        )}
        {!isIOS && (
          <button
            onClick={handleInstall}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 transition-colors"
          >
            <Download size={13} /> Install
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}

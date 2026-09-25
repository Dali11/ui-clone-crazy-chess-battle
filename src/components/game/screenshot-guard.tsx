"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

/**
 * Best-effort screenshot / screen-recording protection for the game page.
 *
 * What a website CAN do: hide the game whenever the page is not the
 * active, visible tab (tab switch, app switch, window losing focus,
 * printing), block right-click/long-press context menus, and disable
 * long-press callouts. What NO website can do: intercept OS-level
 * screenshots (Print Screen, phone buttons) or external recording apps
 * (OBS, phone screen recording) while the page is front and focused —
 * that requires a native app (FLAG_SECURE on Android).
 *
 * Owner rule (2026-09-25): screenshot and screen recording on the game
 * page are not allowed — this guard hides the board the moment the
 * page loses visibility or focus, so captures of an unfocused game
 * page get an inert cover instead of live game state.
 */
export default function ScreenshotGuard() {
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    const onVisibility = () => setCovered(document.visibilityState !== "visible");
    const onBlur = () => setCovered(true);
    const onFocus = () => setCovered(false);
    const onBeforePrint = () => setCovered(true);
    const onAfterPrint = () => setCovered(false);
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    document.addEventListener("contextmenu", onContextMenu);

    // Long-press / image callout suppression while on the game page
    document.body.classList.add("game-page-protected");

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      document.removeEventListener("contextmenu", onContextMenu);
      document.body.classList.remove("game-page-protected");
    };
  }, []);

  if (!covered) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-3 bg-ccb-dark/95 backdrop-blur-2xl"
      aria-label="Content protection"
    >
      <ShieldAlert className="w-10 h-10 text-ccb-primary" />
      <p className="text-sm font-bold text-ccb-text">Content protection active</p>
      <p className="text-xs text-ccb-muted text-center max-w-xs px-6">
        Screenshots and screen recording are not allowed on this page. The game
        is hidden while this tab is not in focus.
      </p>
    </div>
  );
}

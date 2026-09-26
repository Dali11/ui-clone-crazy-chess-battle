"use client";

import { useEffect, useState, useMemo } from "react";
import { ShieldAlert } from "lucide-react";

/**
 * Best-effort screenshot / screen-recording protection for the game page.
 *
 * HARD PLATFORM LIMIT: no browser exposes an event for OS-level
 * screenshots (phone buttons, Print Screen) or external recorders while
 * the page is visible and focused. A website can never truly block
 * those — only a native app shell can (FLAG_SECURE on Android).
 *
 * So this guard does the two things a website CAN do:
 *  1. Hide the game the moment the page is not the active, visible tab
 *     (tab switch, app switch, window blur, printing) and block
 *     right-click/long-press context menus.
 *  2. WATERMARK everything on screen with the viewer's identity
 *     (name · user id · game id), the same anti-leak approach
 *     chess.com uses: any screenshot or recording that leaks a
 *     position identifies exactly which account took it.
 *
 * Owner rule (2026-09-25): screenshots and screen recording on the
 * game page are not allowed.
 */
export default function ScreenshotGuard({ watermark }: { watermark?: string }) {
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

  // Repeated diagonal watermark tile. Built as an inline SVG background so
  // the whole viewport (board, clocks, chat, modals) is covered by a single
  // non-interactive layer. Subtle enough not to disturb play, always
  // present in any capture.
  const watermarkUrl = useMemo(() => {
    if (!watermark) return null;
    // Escape XML specials so usernames can never break the SVG markup
    const safe = watermark.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tile = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='170'><text x='-40' y='95' transform='rotate(-30)' font-family='sans-serif' font-size='13' font-weight='700' fill='rgba(255,255,255,0.08)'>${safe}</text></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(tile)}")`;
  }, [watermark]);

  return (
    <>
      {/* Persistent identity watermark — sits above everything on the game
          page (incl. dialogs) but below the focus cover; clicks pass through. */}
      {watermarkUrl && !covered && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[900] pointer-events-none select-none"
          style={{ backgroundImage: watermarkUrl, backgroundRepeat: "repeat" }}
        />
      )}

      {covered && (
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
      )}
    </>
  );
}

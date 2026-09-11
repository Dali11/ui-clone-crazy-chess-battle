"use client";

// Unread DM count for the Chats badge in the bottom nav. Refreshes on
// mount, on route changes, when the tab regains focus, and on a slow
// poll while the page stays open.

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const POLL_MS = 45_000;

export function useChatsUnread() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/chats/unread", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUnread(typeof data.unread === "number" ? data.unread : 0);
      }
    } catch {}
  }, []);

  // Refresh on mount and on every route change (covers coming back from
  // a chat, where opening the thread marks messages read).
  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  // Refresh when the tab becomes visible again (PWA resume)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  // Slow poll while the app is open
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return unread;
}

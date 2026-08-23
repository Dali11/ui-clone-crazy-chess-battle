"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Check, X, Swords, Trophy, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications/list");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {}
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/mark-read", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const acceptRematch = async (offerId: string, notifId: string) => {
    try {
      const res = await fetch("/api/game/rematch/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.gameId) {
          // Mark notification as read
          await fetch("/api/notifications/mark-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: notifId }),
          });
          // Redirect to the game
          window.location.href = `/game/${data.gameId}`;
        }
      }
    } catch {}
  };

  const declineRematch = async (offerId: string, notifId: string) => {
    try {
      await fetch("/api/game/rematch/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notifId }),
      });
      // Remove from list
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  const getIcon = (type: string) => {
    if (type === "rematch" || type === "rematch_accepted" || type === "rematch_declined") return Swords;
    if (type === "tournament") return Trophy;
    return Bell;
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setOpen(!open); if (!open && unreadCount > 0) markAllRead(); }}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-ccb-danger text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop — tap outside to close */}
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
          {/* Centered panel — anchored to viewport, not the bell button, so it's never cut off */}
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-sm rounded-xl border border-ccb-border bg-ccb-dark shadow-2xl max-h-[70vh] overflow-y-auto">
          <div className="sticky top-0 bg-ccb-dark border-b border-ccb-border px-4 py-3 flex items-center justify-between">
            <span className="font-semibold text-sm text-ccb-text">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-ccb-primary hover:text-ccb-primary/80">
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ccb-muted">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y divide-ccb-border">
              {notifications.map((notif) => {
                const Icon = getIcon(notif.type);
                const isRematch = notif.type === "rematch";
                const isRematchResult = notif.type === "rematch_accepted" || notif.type === "rematch_declined";
                return (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 transition-colors ${!notif.read ? "bg-ccb-primary/5" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isRematch ? "bg-ccb-primary/15 text-ccb-primary" :
                        isRematchResult ? "bg-emerald-500/10 text-emerald-400" :
                        "bg-ccb-surface text-ccb-muted"
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ccb-text">{notif.title}</p>
                        <p className="text-xs text-ccb-muted mt-0.5">{notif.body}</p>
                        <p className="text-[10px] text-ccb-muted/60 mt-1">{formatTime(notif.created_at)}</p>

                        {/* Rematch accept/decline buttons */}
                        {isRematch && notif.data?.offerId && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => acceptRematch(notif.data.offerId, notif.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                            >
                              <Check className="w-3 h-3" /> Accept
                            </button>
                            <button
                              onClick={() => declineRematch(notif.data.offerId, notif.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              <X className="w-3 h-3" /> Decline
                            </button>
                          </div>
                        )}

                        {/* Rematch accepted — link to game */}
                        {notif.type === "rematch_accepted" && notif.data?.gameId && (
                          <a
                            href={`/game/${notif.data.gameId}`}
                            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-ccb-primary hover:text-ccb-primary/80"
                          >
                            <Swords className="w-3 h-3" /> Join the game →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}

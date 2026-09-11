"use client";

// The Chats hub — groups pinned by default (your country + global), then
// DM conversations, plus a username search to start new chats.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Globe, Loader2, MessageCircle, Search, Pin } from "lucide-react";

interface Group {
  id: string;
  name: string;
  country: string | null;
  lastBody: string | null;
  lastDeleted: boolean;
  lastAt: string | null;
}

interface Conversation {
  partnerId: string;
  username: string;
  avatarUrl: string | null;
  lastBody: string | null;
  lastDeleted: boolean;
  lastMine: boolean;
  lastAt: string;
  unread: number;
}

interface UserHit {
  id: string;
  username: string;
  avatar_url: string | null;
}

const AVATAR_COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-lime-600",
  "bg-emerald-600", "bg-teal-600", "bg-sky-600", "bg-indigo-500",
  "bg-violet-500", "bg-fuchsia-500", "bg-pink-500", "bg-rose-500",
];
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function timeShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function ChatsClient() {
  const supabase = typeof window !== "undefined" ? createClient() : null;
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [userHits, setUserHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chats/overview");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
        setConversations(data.conversations || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced username search (only when typing 2+ chars)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setUserHits([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/chats/users?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (res.ok) setUserHits(data.users || []);
      } catch {}
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className="max-w-3xl mx-auto -mt-2 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ccb-text flex items-center gap-2">
            Chats
            {totalUnread > 0 && (
              <span className="bg-ccb-primary text-white text-[11px] font-bold rounded-full px-2 py-0.5">
                {totalUnread}
              </span>
            )}
          </h1>
          <p className="text-xs text-ccb-muted">Groups & direct messages</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-full border border-ccb-border bg-ccb-card px-4 py-2 focus-within:border-ccb-primary/50 transition-colors">
        <Search className="w-4 h-4 text-ccb-muted shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats or players by username…"
          className="flex-1 bg-transparent text-sm text-ccb-text placeholder:text-ccb-muted outline-none"
        />
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
        </div>
      ) : (
        <>
          {/* Search results — start a new DM */}
          {(userHits.length > 0 || searching) && query.trim().length >= 2 && (
            <div className="card p-2">
              <p className="text-[11px] uppercase tracking-wide text-ccb-muted px-2 pt-1 pb-2">Start a new chat</p>
              {searching && userHits.length === 0 ? (
                <p className="text-xs text-ccb-muted px-2 pb-2">Searching…</p>
              ) : userHits.length === 0 ? (
                <p className="text-xs text-ccb-muted px-2 pb-2">No players found</p>
              ) : userHits.map((u) => (
                <Link key={u.id} href={`/chats/dm/${u.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ccb-surface">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${colorFor(u.username)}`}>
                    {u.username?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ccb-text truncate">{u.username}</p>
                    <p className="text-xs text-ccb-muted">Send a message</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Pinned groups */}
          <div className="card overflow-hidden">
            <p className="text-[11px] uppercase tracking-wide text-ccb-muted px-3 pt-3 flex items-center gap-1">
              <Pin className="w-3 h-3" /> Groups
            </p>
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/chats/${g.id}`}
                className="flex items-center gap-3 px-3 py-3 border-b border-ccb-border last:border-0 hover:bg-ccb-surface transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-ccb-primary flex items-center justify-center shrink-0 text-white">
                  {g.country ? <MessageCircle className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ccb-text truncate">{g.name}</p>
                  <p className="text-xs text-ccb-muted truncate">
                    {g.lastAt ? (g.lastDeleted ? <em className="text-ccb-muted/70">This message was deleted</em> : g.lastBody || "—") : "No messages yet"}
                  </p>
                </div>
                <span className="text-[10px] text-ccb-muted shrink-0">{timeShort(g.lastAt)}</span>
              </Link>
            ))}
          </div>

          {/* DM conversations */}
          <div className="card overflow-hidden">
            <p className="text-[11px] uppercase tracking-wide text-ccb-muted px-3 pt-3">Direct messages</p>
            {conversations.length === 0 ? (
              <p className="text-xs text-ccb-muted px-3 py-4">
                No direct messages yet — search a player above to start one.
              </p>
            ) : conversations.map((c) => (
              <Link
                key={c.partnerId}
                href={`/chats/dm/${c.partnerId}`}
                className="flex items-center gap-3 px-3 py-3 border-b border-ccb-border last:border-0 hover:bg-ccb-surface transition-colors"
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${colorFor(c.username)}`}>
                  {c.username?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ccb-text truncate">{c.username}</p>
                  <p className={`text-xs truncate ${c.unread > 0 ? "text-ccb-text font-medium" : "text-ccb-muted"}`}>
                    {c.lastAt ? (
                      c.lastDeleted ? <em className="text-ccb-muted/70">This message was deleted</em>
                      : <>{c.lastMine ? "You: " : ""}{c.lastBody || "—"}</>
                    ) : "—"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-ccb-muted">{timeShort(c.lastAt)}</span>
                  {c.unread > 0 && (
                    <span className="bg-ccb-primary text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {c.unread}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

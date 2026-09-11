"use client";

// Shared WhatsApp-style chat surface used for BOTH group rooms and DMs.
// Group mode talks to /api/community/messages; DM mode talks to
// /api/chats/dm/[userId]. Realtime is postgres_changes on the matching
// table (community_messages / direct_messages), which respects RLS —
// foreign-country rooms and other people's DMs simply never arrive.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, Loader2, Send, Users, Check, CheckCheck } from "lucide-react";

export interface ChatMessage {
  id: number;
  body: string;
  created_at: string;
  deleted_at: string | null;
  user_id?: string;         // groups
  username?: string;        // groups
  avatar_url?: string | null;
  sender_id?: string;       // dms
  recipient_id?: string;    // dms
  read_at?: string | null;  // dms
}

const MAX_BODY = 500;

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

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(d: Date): string {
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Renders a chat body as text + clickable http(s) links (player request).
// Only http/https URLs become anchors; everything else stays plain text,
// so nothing can inject markup. Links open in a new tab, sandboxed.
function LinkifiedBody({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2 break-all hover:opacity-80"
            onClick={(e) => e.stopPropagation()}
          >
            {part.length > 48 ? part.slice(0, 45) + "…" : part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

interface Props {
  mode: "group" | "dm";
  room?: string;             // group slug
  partnerId?: string;        // dm partner
  headerTitle: string;
  headerSubtitle?: string;
  headerIcon?: React.ReactNode;
  myUserId: string | null;
  isAdmin?: boolean;
  onUnauthorized?: () => void;
}

export default function ChatView({ mode, room, partnerId, headerTitle, headerSubtitle, headerIcon, myUserId, isAdmin = false, onUnauthorized }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bottomStickRef = useRef(true);
  const lastLoadOlderRef = useRef(0);
  const readMarkedRef = useRef(0);

  const senderOf = useCallback((m: ChatMessage): string | undefined => {
    return mode === "group" ? m.user_id : m.sender_id;
  }, [mode]);

  // ── Dedup-append keeping ascending id order ────────────────────────
  const appendMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      const idx = prev.findIndex((x) => x.id > m.id);
      if (idx === -1) return [...prev, m];
      return [...prev.slice(0, idx), m, ...prev.slice(idx)];
    });
  }, []);

  const applyUpdate = useCallback((m: ChatMessage) => {
    setMessages((prev) => prev.map((x) => {
      if (x.id !== m.id) return x;
      return { ...x, deleted_at: m.deleted_at ?? x.deleted_at, read_at: m.read_at ?? x.read_at };
    }));
  }, []);

  // ── Endpoints per mode ─────────────────────────────────────────────
  const listUrl = useCallback((before?: number) => {
    if (mode === "group") {
      return `/api/community/messages?room=${room}${before ? `&before=${before}` : ""}`;
    }
    return `/api/chats/dm/${partnerId}${before ? `?before=${before}` : ""}`;
  }, [mode, room, partnerId]);

  const markRead = useCallback(async () => {
    if (mode !== "dm" || !partnerId) return;
    if (Date.now() - readMarkedRef.current < 1500) return;
    readMarkedRef.current = Date.now();
    try { await fetch(`/api/chats/dm/${partnerId}`, { method: "PATCH" }); } catch {}
  }, [mode, partnerId]);

  // ── Initial load ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(listUrl());
        if (cancelled) return;
        if (res.status === 403 || res.status === 404) {
          setError("This chat isn't available.");
          if (res.status === 403 && onUnauthorized) onUnauthorized();
        } else if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          setHasMore(!!data.hasMore);
          markRead();
        } else {
          setError("Couldn't load messages.");
        }
      } catch {
        if (!cancelled) setError("Couldn't load messages.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, room, partnerId]);

  // ── Realtime: group rooms ───────────────────────────────────────────
  // DM realtime needs two channels (incoming + outgoing filters) and is
  // registered in its own effect below.
  useEffect(() => {
    if (mode !== "group" || !room) return;
    const channel = supabase
      .channel(`community:${room}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages", filter: `room=eq.${room}` },
        (payload) => { appendMessage(payload.new as ChatMessage); })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_messages", filter: `room=eq.${room}` },
        (payload) => { applyUpdate(payload.new as ChatMessage); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, mode, room, appendMessage, applyUpdate]);

  const myId = myUserId;

  useEffect(() => {
    if (mode !== "dm" || !partnerId) return;
    const inChannel = supabase
      .channel(`dm-in:${partnerId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${myId ?? "none"}` },
        (payload) => {
          const m = payload.new as ChatMessage;
          if (m.sender_id === partnerId) {
            appendMessage(m);
            markRead();
          }
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${myId ?? "none"}` },
        (payload) => { applyUpdate(payload.new as ChatMessage); })
      .subscribe();
    const outChannel = supabase
      .channel(`dm-out:${partnerId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `sender_id=eq.${myId ?? "none"}` },
        (payload) => { appendMessage(payload.new as ChatMessage); })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages", filter: `sender_id=eq.${myId ?? "none"}` },
        (payload) => { applyUpdate(payload.new as ChatMessage); })
      .subscribe();
    return () => {
      supabase.removeChannel(inChannel);
      supabase.removeChannel(outChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, partnerId, myId, appendMessage, applyUpdate, markRead]);

  // ── Auto-scroll stickiness ────────────────────────────────────────
  useEffect(() => {
    if (bottomStickRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: messages.length > 60 ? "auto" : "smooth" });
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    bottomStickRef.current = nearBottom;
    setAtBottom(nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomStickRef.current = true;
    setAtBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ── Older pages ────────────────────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    if (Date.now() - lastLoadOlderRef.current < 600) return;
    const el = scrollRef.current;
    if (!el) return;
    lastLoadOlderRef.current = Date.now();
    const prevHeight = el.scrollHeight;
    setLoadingOlder(true);
    try {
      const res = await fetch(listUrl(messages[0].id));
      const data = await res.json();
      if (res.ok) {
        const older: ChatMessage[] = data.messages || [];
        setHasMore(!!data.hasMore);
        if (older.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...older.filter((m) => !seen.has(m.id)), ...prev];
          });
          requestAnimationFrame(() => {
            const el2 = scrollRef.current;
            if (el2) el2.scrollTop = el2.scrollHeight - prevHeight;
          });
        }
      }
    } catch {}
    setLoadingOlder(false);
  }, [loadingOlder, hasMore, messages, listUrl]);

  // ── Send ───────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const url = mode === "group"
        ? "/api/community/messages"
        : `/api/chats/dm/${partnerId}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "group" ? { room, body } : { body }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        appendMessage(data.message);
        setInput("");
        if (mode === "dm") markRead();
      } else {
        setError(data.error || "Couldn't send — try again");
      }
    } catch {
      setError("Couldn't send — check your connection");
    }
    setSending(false);
  }, [input, sending, mode, room, partnerId, appendMessage, markRead]);

  // ── Delete ────────────────────────────────────────────────────────
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const url = mode === "group"
        ? `/api/community/messages?id=${deleteTarget.id}`
        : `/api/chats/dm/${partnerId}?id=${deleteTarget.id}`;
      await fetch(url, { method: "DELETE" });
      setDeleteTarget(null);
    } catch {}
    setDeleting(false);
  }, [deleteTarget, deleting, mode, partnerId]);

  const canDelete = useCallback((m: ChatMessage) => {
    if (mode === "group") {
      return (myUserId && m.user_id === myUserId) || isAdmin;
    }
    return myUserId && (m.sender_id === myUserId || m.recipient_id === myUserId);
  }, [mode, myUserId, isAdmin]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-[calc(100vh-11rem)] min-h-[420px] max-w-3xl mx-auto -mt-2">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-t-xl border border-ccb-border bg-ccb-card">
        <div className="w-10 h-10 rounded-full bg-ccb-primary flex items-center justify-center shrink-0 text-white">
          {headerIcon ?? <Users className="w-5 h-5" />}
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-ccb-text truncate">{headerTitle}</h1>
          <p className="text-xs text-ccb-muted truncate">{headerSubtitle}</p>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto border-x border-b border-ccb-border bg-ccb-surface/40 rounded-b-xl overscroll-contain"
        ref={scrollRef}
        onScroll={(e) => {
          handleScroll();
          const el = e.currentTarget;
          if (el.scrollTop <= 40) loadOlder();
        }}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
          </div>
        ) : (
          <div className="px-3 py-3">
            {hasMore && (
              <div className="flex justify-center pb-2">
                {loadingOlder ? (
                  <Loader2 className="w-4 h-4 animate-spin text-ccb-muted" />
                ) : (
                  <span className="text-[11px] text-ccb-muted">Scroll up for older messages</span>
                )}
              </div>
            )}
            {messages.length === 0 && !error && (
              <div className="text-center py-14 space-y-2">
                {headerIcon ?? <Users className="w-10 h-10 text-ccb-muted mx-auto" />}
                <p className="text-sm text-ccb-muted">No messages yet — say hello! 👋</p>
              </div>
            )}
            {error && messages.length === 0 && (
              <div className="text-center py-14">
                <p className="text-sm text-ccb-muted">{error}</p>
              </div>
            )}
            {messages.map((m, i) => {
              const mine = myUserId && senderOf(m) === myUserId;
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(new Date(prev.created_at), new Date(m.created_at));
              const grouped = prev && senderOf(prev) === senderOf(m) && !showDay &&
                new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
              const deleted = !!m.deleted_at;
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex justify-center py-2">
                      <span className="text-[11px] text-ccb-muted bg-ccb-card border border-ccb-border rounded-full px-3 py-0.5">
                        {dayLabel(new Date(m.created_at))}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
                    {deleted ? (
                      <div className={`max-w-[78%] rounded-2xl px-3 py-1.5 text-[13px] italic text-ccb-muted ${mine ? "bg-ccb-surface" : "bg-ccb-card"} border border-ccb-border`}>
                        This message was deleted
                      </div>
                    ) : (
                      <button
                        onClick={() => canDelete(m) && setDeleteTarget(m)}
                        className={`max-w-[78%] text-left rounded-2xl px-3 py-2 ${mine
                          ? "bg-ccb-primary text-white rounded-br-sm"
                          : "bg-ccb-card text-ccb-text border border-ccb-border rounded-bl-sm"
                        }`}
                      >
                        {!mine && mode === "group" && !grouped && (
                          <span className="block text-[11px] font-semibold text-ccb-muted">
                            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${colorFor(m.username || "")}`} />
                            {m.username}
                          </span>
                        )}
                        <span className="text-[13.5px] sm:text-sm whitespace-pre-wrap break-words block"><LinkifiedBody text={m.body} /></span>
                        <span className={`block text-right text-[10px] mt-0.5 flex items-center justify-end gap-1 ${mine ? "text-white/70" : "text-ccb-muted"}`}>
                          {mode === "dm" && mine && (m.read_at
                            ? <CheckCheck className="w-3 h-3" />
                            : <Check className="w-3 h-3" />)}
                          {timeLabel(m.created_at)}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Scroll-to-bottom pill */}
      {!atBottom && !loading && (
        <button
          onClick={scrollToBottom}
          className="absolute right-6 bottom-28 w-9 h-9 rounded-full bg-ccb-card border border-ccb-border shadow-md flex items-center justify-center z-10"
          aria-label="Scroll to latest"
        >
          <ChevronDown className="w-4 h-4 text-ccb-text" />
        </button>
      )}

      {/* Composer */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 flex items-center rounded-full border border-ccb-border bg-ccb-card px-4 py-2 focus-within:border-ccb-primary/50 transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_BODY))}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={mode === "group" ? `Message ${headerTitle}…` : "Type a message…"}
            maxLength={MAX_BODY}
            className="flex-1 bg-transparent text-sm text-ccb-text placeholder:text-ccb-muted outline-none"
          />
          {input.length > MAX_BODY - 50 && (
            <span className="text-[10px] text-ccb-muted ml-2">{MAX_BODY - input.length}</span>
          )}
        </div>
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full bg-ccb-primary text-white flex items-center justify-center disabled:opacity-40 shrink-0"
          aria-label="Send"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      {error && messages.length > 0 && <p className="text-xs text-destructive mt-1 px-2">{error}</p>}

      {/* Delete confirm sheet */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-ccb-card border border-ccb-border p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-ccb-text">Delete this message?</p>
            <p className="text-xs text-ccb-muted truncate">&ldquo;{deleteTarget.body}&rdquo;</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg bg-ccb-surface border border-ccb-border py-2 text-sm text-ccb-text">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 rounded-lg bg-destructive text-white py-2 text-sm font-medium disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

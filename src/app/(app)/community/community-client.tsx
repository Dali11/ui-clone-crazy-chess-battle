"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, Loader2, MessageCircle, Send, Users } from "lucide-react";

interface Message {
  id: number;
  room: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  body: string;
  created_at: string;
  deleted_at: string | null;
}

const ROOM = "malawi";
const ROOM_NAME = "Crazy Chess Battles Malawi";
const MAX_BODY = 500;

// Deterministic color per username for the chat (WhatsApp does the same)
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

export default function CommunityClient() {
  const supabase = useMemo(() => createClient(), []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bottomStickRef = useRef(true); // stick to bottom unless user scrolled up
  const lastLoadOlderRef = useRef(0);  // cooldown — prevents a prepend→scroll→prepend loop

  // ── Identify me ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();
      setIsAdmin(profile?.is_admin === true);
    })();
  }, [supabase]);

  // ── Dedup-append a message (realtime may race the POST response) ─
  const appendMessage = useCallback((m: Message) => {
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      // keep ascending order by id
      const idx = prev.findIndex((x) => x.id > m.id);
      if (idx === -1) return [...prev, m];
      return [...prev.slice(0, idx), m, ...prev.slice(idx)];
    });
  }, []);

  // ── Initial load ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/community/messages?room=${ROOM}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setMessages(data.messages || []);
          setHasMore(!!data.hasMore);
        } else {
          setError("Couldn't load messages. Pull down to retry.");
        }
      } catch {
        if (!cancelled) setError("Couldn't load messages. Pull down to retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Realtime: new messages + deletions ───────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`community:${ROOM}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages", filter: `room=eq.${ROOM}` },
        (payload) => {
          appendMessage(payload.new as Message);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_messages", filter: `room=eq.${ROOM}` },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, deleted_at: updated.deleted_at } : m)));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, appendMessage]);

  // ── Auto-scroll behavior (WhatsApp-style stickiness) ──────────────
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

  // ── Load older messages when scrolled to the top ──────────────────
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    if (Date.now() - lastLoadOlderRef.current < 600) return; // cooldown guard
    const el = scrollRef.current;
    if (!el) return;
    lastLoadOlderRef.current = Date.now();
    const prevHeight = el.scrollHeight;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/community/messages?room=${ROOM}&before=${messages[0].id}`);
      const data = await res.json();
      if (res.ok) {
        const older: Message[] = data.messages || [];
        setHasMore(!!data.hasMore);
        if (older.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...older.filter((m) => !seen.has(m.id)), ...prev];
          });
          // keep the viewport anchored where it was
          requestAnimationFrame(() => {
            const el2 = scrollRef.current;
            if (el2) el2.scrollTop = el2.scrollHeight - prevHeight;
          });
        }
      }
    } catch {}
    setLoadingOlder(false);
  }, [loadingOlder, hasMore, messages]);

  const handleScrollLoad = useCallback(() => {
    const el = scrollRef.current;
    if (el && el.scrollTop <= 40) loadOlder();
  }, [loadOlder]);

  // ── Send ──────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/community/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: ROOM, body }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        appendMessage(data.message);
        setInput("");
      } else {
        setError(data.error || "Couldn't send — try again");
      }
    } catch {
      setError("Couldn't send — check your connection");
    }
    setSending(false);
  }, [input, sending, appendMessage]);

  // ── Delete ────────────────────────────────────────────────────────
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await fetch(`/api/community/messages?id=${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
    } catch {}
    setDeleting(false);
  }, [deleteTarget, deleting]);

  const canDelete = useCallback((m: Message) => {
    return (currentUserId && m.user_id === currentUserId) || isAdmin;
  }, [currentUserId, isAdmin]);

  // ── Render ────────────────────────────────────────────────────────
  const distinctAuthors = useMemo(() => new Set(messages.filter((m) => !m.deleted_at).map((m) => m.user_id)).size, [messages]);

  return (
    <div className="relative flex flex-col h-[calc(100vh-11rem)] min-h-[420px] max-w-3xl mx-auto -mt-2">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-t-xl border border-ccb-border bg-ccb-card">
        <div className="w-10 h-10 rounded-full bg-ccb-primary flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-ccb-text truncate">{ROOM_NAME}</h1>
          <p className="text-xs text-ccb-muted flex items-center gap-1">
            <Users className="w-3 h-3" />
            {distinctAuthors > 0 ? `${distinctAuthors} chatting` : "Official community room"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto border-x border-b border-ccb-border bg-ccb-surface/40 rounded-b-xl overscroll-contain"
        ref={scrollRef}
        onScroll={(e) => { handleScroll(); handleScrollLoad(); }}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
          </div>
        ) : (
          <div className="px-3 py-3 space-y-0.5">
            {hasMore && (
              <div className="flex justify-center pb-2">
                {loadingOlder ? (
                  <Loader2 className="w-4 h-4 animate-spin text-ccb-muted" />
                ) : (
                  <span className="text-[11px] text-ccb-muted">Scroll up for older messages</span>
                )}
              </div>
            )}
            {messages.length === 0 && (
              <div className="text-center py-14 space-y-2">
                <MessageCircle className="w-10 h-10 text-ccb-muted mx-auto" />
                <p className="text-sm text-ccb-muted">No messages yet — say hello! 👋</p>
              </div>
            )}
            {messages.map((m, i) => {
              const mine = currentUserId === m.user_id;
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(new Date(prev.created_at), new Date(m.created_at));
              const grouped = prev && prev.user_id === m.user_id && !showDay &&
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
                        {!mine && !grouped && (
                          <span className="block text-[11px] font-semibold text-ccb-muted">
                            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${colorFor(m.username)}`} />
                            {m.username}
                          </span>
                        )}
                        <span className="text-[13.5px] sm:text-sm whitespace-pre-wrap break-words block">{m.body}</span>
                        <span className={`block text-right text-[10px] mt-0.5 ${mine ? "text-white/70" : "text-ccb-muted"}`}>
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
            placeholder="Message the community…"
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
      {error && <p className="text-xs text-destructive mt-1 px-2">{error}</p>}

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

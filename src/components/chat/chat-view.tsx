"use client";

// Shared WhatsApp-style chat surface used for BOTH group rooms and DMs.
// Group mode talks to /api/community/messages; DM mode talks to
// /api/chats/dm/[userId]. Realtime is postgres_changes on the matching
// table (community_messages / direct_messages), which respects RLS —
// foreign-country rooms and other people's DMs simply never arrive.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, ChevronDown, Loader2, Mic, Paperclip, Play, Send, Trash2, Users, Check, CheckCheck, X } from "lucide-react";
import VoiceBubble from "./voice-bubble";
import { useVoiceRecorder } from "./use-voice-recorder";
import { compressImage } from "./compress-image";

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
  audio_url?: string | null;
  audio_duration?: number | null;
  image_url?: string | null;
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

// Small round avatar used to the left of group messages — real profile
// pic if the sender has one set, falling back to an initial-letter
// circle (and falling BACK to that same circle if the image URL 404s,
// so a stale/deleted photo never leaves a broken-image icon).
function MsgAvatar({ username, url }: { username: string; url?: string | null }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={username}
        onError={() => setBroken(true)}
        className="w-7 h-7 rounded-full object-cover shrink-0 border border-ccb-border"
      />
    );
  }
  return (
    <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-[11px] font-bold ${colorFor(username)}`}>
      {username?.[0]?.toUpperCase() || "?"}
    </div>
  );
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

// Challenge links (quick-match announces + battle challenge invites) render
// as a tappable "Play Now" button instead of a bare URL — same-origin only,
// via next/link for instant SPA nav. Every other http(s) URL stays a plain
// clickable anchor (player request). Nothing else can inject markup.
const CHALLENGE_LINK_RE = /^https?:\/\/[^\s/]+\/((?:draughts\/)?(?:battle-)?challenge\/[a-zA-Z0-9-]+)\/?$/;

function LinkifiedBody({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!/^https?:\/\//.test(part)) return <span key={i}>{part}</span>;

        const challengeMatch = part.match(CHALLENGE_LINK_RE);
        // Only turn same-origin challenge links into a button — a foreign
        // domain that happens to share the path shape stays a plain link
        // (so the real destination is never hidden from the player).
        const sameOrigin = typeof window !== "undefined" && part.startsWith(window.location.origin + "/");
        if (challengeMatch && sameOrigin) {
          return (
            <Link
              key={i}
              href={`/${challengeMatch[1]}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 mb-0.5 inline-flex items-center gap-1.5 rounded-full bg-ccb-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-ccb-primary/90 transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              Play Now
            </Link>
          );
        }

        return (
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
        );
      })}
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
  headerAvatarUrl?: string | null;
  myUserId: string | null;
  isAdmin?: boolean;
  onUnauthorized?: () => void;
}

export default function ChatView({ mode, room, partnerId, headerTitle, headerSubtitle, headerIcon, headerAvatarUrl, myUserId, isAdmin = false, onUnauthorized }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [headerAvatarBroken, setHeaderAvatarBroken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const mic = useVoiceRecorder();
  const [pendingImage, setPendingImage] = useState<{ blob: Blob; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

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

  // Hard deletes (e.g. expired/accepted challenge links) vanish live.
  const removeMessage = useCallback((id?: string | number) => {
    if (id === undefined) return;
    setMessages((prev) => prev.filter((x) => x.id !== id && String(x.id) !== String(id)));
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
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "community_messages", filter: `room=eq.${room}` },
        (payload) => { removeMessage((payload.old as { id?: string | number })?.id); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, mode, room, appendMessage, applyUpdate, removeMessage]);

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
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${myId ?? "none"}` },
        (payload) => { removeMessage((payload.old as { id?: string | number })?.id); })
      .subscribe();
    const outChannel = supabase
      .channel(`dm-out:${partnerId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `sender_id=eq.${myId ?? "none"}` },
        (payload) => { appendMessage(payload.new as ChatMessage); })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages", filter: `sender_id=eq.${myId ?? "none"}` },
        (payload) => { applyUpdate(payload.new as ChatMessage); })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "direct_messages", filter: `sender_id=eq.${myId ?? "none"}` },
        (payload) => { removeMessage((payload.old as { id?: string | number })?.id); })
      .subscribe();
    return () => {
      supabase.removeChannel(inChannel);
      supabase.removeChannel(outChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, partnerId, myId, appendMessage, applyUpdate, removeMessage, markRead]);

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

  // ── Image attachment ────────────────────────────────────────────────
  const pickImage = useCallback(() => fileInputRef.current?.click(), []);

  const onFileChosen = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only images can be attached");
      return;
    }
    try {
      const { blob } = await compressImage(file);
      setPendingImage({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      setError("Couldn't process that image — try a different one");
    }
  }, []);

  const clearPendingImage = useCallback(() => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.preview);
    setPendingImage(null);
  }, [pendingImage]);

  // ── Send ───────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const body = input.trim();
    if ((!body && !pendingImage) || sending || uploadingVoice) return;
    setSending(true);
    setError(null);
    try {
      let imageUrl: string | null = null;
      if (pendingImage) {
        const path = `${myUserId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("chat-images")
          .upload(path, pendingImage.blob, { contentType: "image/jpeg" });
        if (upErr) throw new Error("upload");
        const { data: pub } = supabase.storage.from("chat-images").getPublicUrl(path);
        imageUrl = pub.publicUrl;
      }
      const url = mode === "group"
        ? "/api/community/messages"
        : `/api/chats/dm/${partnerId}`;
      const payload = mode === "group"
        ? { room, body, ...(imageUrl ? { imageUrl } : {}) }
        : { body, ...(imageUrl ? { imageUrl } : {}) };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        appendMessage(data.message);
        setInput("");
        clearPendingImage();
        if (mode === "dm") markRead();
      } else {
        setError(data.error || "Couldn't send — try again");
      }
    } catch {
      setError("Couldn't send — check your connection");
    }
    setSending(false);
  }, [input, sending, uploadingVoice, pendingImage, mode, room, partnerId, myUserId, supabase, appendMessage, markRead, clearPendingImage]);

  // ── Voice notes ─────────────────────────────────────────────────────
  const sendVoice = useCallback(async () => {
    if (sending || uploadingVoice) return;
    setUploadingVoice(true);
    try {
      const clip = await mic.stop();
      if (!clip) { setUploadingVoice(false); return; }
      if (clip.blob.size > 8 * 1024 * 1024) {
        setError("Voice note too long — keep it under 2 minutes");
        setUploadingVoice(false);
        return;
      }
      const ext = clip.mime.includes("mp4") ? "m4a" : "webm";
      const path = `${myUserId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-voice")
        .upload(path, clip.blob, { contentType: clip.mime });
      if (upErr) {
        setError("Couldn't upload the voice note — check your connection");
        setUploadingVoice(false);
        return;
      }
      const { data: pub } = supabase.storage.from("chat-voice").getPublicUrl(path);

      const url = mode === "group"
        ? "/api/community/messages"
        : `/api/chats/dm/${partnerId}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "group"
          ? { room, body: "", audioUrl: pub.publicUrl, audioDuration: clip.duration }
          : { body: "", audioUrl: pub.publicUrl, audioDuration: clip.duration }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        appendMessage(data.message);
        if (mode === "dm") markRead();
      } else {
        setError(data.error || "Couldn't send — try again");
      }
    } catch {
      setError("Couldn't send the voice note — try again");
    }
    setUploadingVoice(false);
  }, [mode, room, partnerId, myUserId, supabase, mic, sending, uploadingVoice, appendMessage, markRead]);

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
      <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-t-xl border border-ccb-border bg-ccb-card">
        <Link
          href="/chats"
          aria-label="Back to chats"
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {headerAvatarUrl && !headerAvatarBroken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headerAvatarUrl}
            alt={headerTitle}
            onError={() => setHeaderAvatarBroken(true)}
            className="w-10 h-10 rounded-full object-cover shrink-0 border border-ccb-border"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-ccb-primary flex items-center justify-center shrink-0 text-white overflow-hidden">
            {headerIcon ?? <Users className="w-5 h-5" />}
          </div>
        )}
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
                  <div className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
                    {!mine && mode === "group" && (
                      grouped ? <div className="w-7 shrink-0" /> : <MsgAvatar username={m.username || "?"} url={m.avatar_url} />
                    )}
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
                          <span className={`block text-[11px] font-semibold ${colorFor(m.username || "").replace("bg-", "text-")}`}>
                            {m.username}
                          </span>
                        )}
                        {m.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.image_url}
                            alt={m.body ? "Chat image" : "Shared image"}
                            onClick={(e) => { e.stopPropagation(); setLightbox(m.image_url!); }}
                            className="rounded-xl max-w-full w-[220px] max-h-[300px] object-cover cursor-zoom-in select-none"
                          />
                        )}
                        {(m.body || m.audio_url) && m.image_url && <div className="h-1" />}
                        {m.audio_url && (
                          <VoiceBubble id={m.id} url={m.audio_url} duration={m.audio_duration} mine={!!mine} />
                        )}
                        {m.body && (
                          <span className="text-[13.5px] sm:text-sm whitespace-pre-wrap break-words block"><LinkifiedBody text={m.body} /></span>
                        )}
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

      {/* Composer (recording bar replaces it while recording) */}
      {mic.recording ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-3 rounded-full border border-ccb-border bg-ccb-card px-4 py-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-sm text-ccb-text tabular-nums font-medium">
              {Math.floor(mic.elapsed / 60)}:{String(mic.elapsed % 60).padStart(2, "0")}
            </span>
            <span className="text-xs text-ccb-muted">Recording…</span>
          </div>
          <button
            onClick={mic.cancel}
            className="w-10 h-10 rounded-full bg-ccb-card border border-ccb-border text-ccb-muted flex items-center justify-center shrink-0"
            aria-label="Cancel voice note"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={sendVoice}
            disabled={uploadingVoice}
            className="w-10 h-10 rounded-full bg-ccb-primary text-white flex items-center justify-center disabled:opacity-40 shrink-0"
            aria-label="Send voice note"
          >
            {uploadingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        <div className="mt-2">
          {pendingImage && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingImage.preview} alt="Attachment preview" className="w-16 h-16 rounded-lg object-cover border border-ccb-border" />
                <button
                  onClick={clearPendingImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ccb-text text-white flex items-center justify-center shadow"
                  aria-label="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <span className="text-xs text-ccb-muted">Add a caption, then send</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center rounded-full border border-ccb-border bg-ccb-card px-4 py-2 focus-within:border-ccb-primary/50 transition-colors">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_BODY))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={mode === "group" ? `Message ${headerTitle}…` : "Type a message…"}
                maxLength={MAX_BODY}
                className="flex-1 bg-transparent text-sm text-ccb-text placeholder:text-ccb-muted outline-none min-w-0"
              />
              {input.length > MAX_BODY - 50 && (
                <span className="text-[10px] text-ccb-muted ml-2 shrink-0">{MAX_BODY - input.length}</span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChosen}
                className="hidden"
              />
              <button
                onClick={pickImage}
                className="ml-2 shrink-0 text-ccb-muted hover:text-ccb-text transition-colors"
                aria-label="Attach image"
              >
                <Paperclip className="w-5 h-5" />
              </button>
            </div>
            {input.trim() || pendingImage ? (
              <button
                onClick={send}
                disabled={sending || uploadingVoice}
                className="w-10 h-10 rounded-full bg-ccb-primary text-white flex items-center justify-center disabled:opacity-40 shrink-0"
                aria-label="Send"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            ) : (
              <button
                onClick={mic.start}
                className="w-10 h-10 rounded-full bg-ccb-primary text-white flex items-center justify-center shrink-0"
                aria-label="Record voice note"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
      {(error || mic.error) && messages.length > 0 && (
        <p className="text-xs text-destructive mt-1 px-2">{error || mic.error}</p>
      )}
      {(mic.error && messages.length === 0) && (
        <p className="text-xs text-destructive mt-1 px-2">{mic.error}</p>
      )}

      {/* Image lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Shared image" className="max-w-full max-h-full object-contain" />
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center backdrop-blur"
            aria-label="Close image"
            onClick={() => setLightbox(null)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Delete confirm sheet */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-ccb-card border border-ccb-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4 space-y-3"
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

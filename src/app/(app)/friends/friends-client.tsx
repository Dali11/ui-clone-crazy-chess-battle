"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Users, UserPlus, Swords, MessageCircle, Check, X, Loader2, ChevronLeft, Trash2 } from "lucide-react";

interface FriendUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  rating: number;
}
interface FriendRow {
  id: string;
  status: string;
  createdAt: string;
  direction: "incoming" | "outgoing";
  user: FriendUser;
}

const TIME_CONTROLS = [
  { key: "bullet", label: "Bullet", sub: "1+0" },
  { key: "blitz", label: "Blitz", sub: "3+2" },
  { key: "rapid", label: "Rapid", sub: "10+0" },
  { key: "classical", label: "Classical", sub: "30+0" },
];

export default function FriendsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<FriendRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRow[]>([]);
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [challengeFor, setChallengeFor] = useState<FriendUser | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/friends", { cache: "no-store" });
      if (res.status === 401) { router.push("/login"); return; }
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
      }
    } catch {} finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // username search to add friends (reuses the chats user-search API)
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/chats/users?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(
            (data.users || []).slice(0, 5).map((u: any) => ({
              id: u.id, username: u.username,
              displayName: u.display_name || null,
              avatarUrl: u.avatar_url || null,
              rating: u.rating ?? null,
            }))
          );
        }
      } catch {} finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const sendRequest = async (userId: string) => {
    setSending(userId);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setToast(data.message || "Friend request sent");
        setSearch("");
        setSearchResults([]);
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || "Couldn't send request");
      }
    } catch { setToast("Couldn't send request"); } finally { setSending(null); }
  };

  const respond = async (requestId: string, action: "accept" | "decline") => {
    setSending(requestId);
    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (res.ok) {
        setToast(action === "accept" ? "You are now friends!" : "Request declined");
        await load();
      }
    } catch {} finally { setSending(null); }
  };

  const removeFriend = async (userId: string) => {
    if (!confirm("Remove this friend?")) return;
    setSending(userId);
    try {
      const res = await fetch("/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) { setToast("Friend removed"); await load(); }
    } catch {} finally { setSending(null); }
  };

  const sendChallenge = async (friendId: string, timeControl: string) => {
    setSending(friendId + timeControl);
    try {
      const res = await fetch("/api/friends/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId, timeControl, rated: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setToast("Challenge sent! They'll get it in chat.");
        setChallengeFor(null);
        void data;
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || "Couldn't send challenge");
      }
    } catch { setToast("Couldn't send challenge"); } finally { setSending(null); }
  };

  const name = (u: FriendUser) => u.displayName || u.username;
  const totalRequests = incoming.length + outgoing.length;

  const Avatar = ({ u, size = 40 }: { u: FriendUser; size?: number }) =>
    u.avatarUrl ? (
      <Image src={u.avatarUrl} alt={name(u)} width={size} height={size} className="rounded-full object-cover" />
    ) : (
      <div className="rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center font-bold text-ccb-muted"
           style={{ width: size, height: size, fontSize: size * 0.4 }}>
        {name(u).charAt(0).toUpperCase()}
      </div>
    );

  return (
    <div className="min-h-screen bg-ccb-bg text-ccb-text pb-24">
      {/* header */}
      <div className="sticky top-0 z-20 bg-ccb-bg/90 backdrop-blur border-b border-ccb-border">
        <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" aria-label="Back" className="p-1 -ml-1 text-ccb-muted hover:text-ccb-text">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold flex items-center gap-2"><Users className="w-5 h-5" /> Friends</h1>
          <div className="ml-auto flex rounded-lg border border-ccb-border overflow-hidden text-sm">
            <button onClick={() => setTab("friends")}
              className={`px-3 py-1.5 ${tab === "friends" ? "bg-ccb-surface text-ccb-text font-semibold" : "text-ccb-muted"}`}>
              Friends
            </button>
            <button onClick={() => setTab("requests")}
              className={`px-3 py-1.5 flex items-center gap-1.5 ${tab === "requests" ? "bg-ccb-surface text-ccb-text font-semibold" : "text-ccb-muted"}`}>
              Requests
              {totalRequests > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[16px]">
                  {totalRequests}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4">
        {/* add friend by username */}
        <div className="mt-4">
          <div className="relative">
            <UserPlus className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ccb-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find players by username to add…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-ccb-surface border border-ccb-border text-sm placeholder:text-ccb-muted/60 focus:outline-none focus:border-ccb-accent"
            />
          </div>
          {(searching || searchResults.length > 0) && search.trim().length >= 2 && (
            <div className="mt-2 rounded-xl border border-ccb-border bg-ccb-surface overflow-hidden">
              {searching && searchResults.length === 0 && (
                <p className="px-3 py-2.5 text-sm text-ccb-muted">Searching…</p>
              )}
              {searchResults.map((u) => {
                const isFriend = friends.some((f) => f.user.id === u.id);
                const isOut = outgoing.some((f) => f.user.id === u.id);
                return (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-ccb-border last:border-0">
                    <Avatar u={u} size={32} />
                    <Link href={`/profile/${u.username}`} className="text-sm font-medium flex-1 truncate">{name(u)}</Link>
                    <span className="text-xs text-ccb-muted">{u.rating ?? "—"}</span>
                    {isFriend ? (
                      <span className="text-xs text-emerald-400 font-semibold">Friends ✓</span>
                    ) : isOut ? (
                      <span className="text-xs text-ccb-muted">Sent</span>
                    ) : (
                      <button
                        onClick={() => sendRequest(u.id)}
                        disabled={sending === u.id}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-ccb-accent text-white disabled:opacity-50">
                        {sending === u.id ? "…" : "Add"}
                      </button>
                    )}
                  </div>
                );
              })}
              {!searching && searchResults.length === 0 && (
                <p className="px-3 py-2.5 text-sm text-ccb-muted">No players found.</p>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ccb-muted" /></div>
        ) : tab === "friends" ? (
          <div className="mt-4 space-y-2">
            {friends.length === 0 && (
              <div className="text-center py-14 text-ccb-muted">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No friends yet. Search a username above, or add players after your games.</p>
              </div>
            )}
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-ccb-surface border border-ccb-border">
                <Avatar u={f.user} />
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${f.user.username}`} className="font-semibold text-sm truncate block hover:underline">
                    {name(f.user)}
                  </Link>
                  <p className="text-xs text-ccb-muted">{f.user.rating ?? "—"} rating</p>
                </div>
                <Link href={`/chats/dm/${f.user.id}`} aria-label="Chat"
                     className="p-2 rounded-lg text-ccb-muted hover:text-ccb-text hover:bg-ccb-border/30">
                  <MessageCircle className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => setChallengeFor(f.user)}
                  className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-ccb-accent text-white">
                  <Swords className="w-4 h-4" /> Challenge
                </button>
                <button onClick={() => removeFriend(f.user.id)} aria-label="Remove friend"
                        className="p-2 rounded-lg text-ccb-muted/50 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {totalRequests === 0 && (
              <div className="text-center py-14 text-ccb-muted">
                <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No pending requests.</p>
              </div>
            )}
            {incoming.length > 0 && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2">Received</h2>
                <div className="space-y-2">
                  {incoming.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-ccb-surface border border-ccb-border">
                      <Avatar u={f.user} size={36} />
                      <Link href={`/profile/${f.user.username}`} className="font-semibold text-sm flex-1 truncate hover:underline">
                        {name(f.user)}
                      </Link>
                      <button onClick={() => respond(f.id, "decline")} disabled={sending === f.id}
                              className="p-2 rounded-lg text-ccb-muted hover:text-red-400" aria-label="Decline">
                        <X className="w-4 h-4" />
                      </button>
                      <button onClick={() => respond(f.id, "accept")} disabled={sending === f.id}
                              className="flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50">
                        {sending === f.id ? "…" : (<><Check className="w-4 h-4" /> Accept</>)}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {outgoing.length > 0 && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2">Sent (waiting)</h2>
                <div className="space-y-2">
                  {outgoing.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-ccb-surface/60 border border-ccb-border">
                      <Avatar u={f.user} size={36} />
                      <div className="flex-1 min-w-0">
                        <Link href={`/profile/${f.user.username}`} className="font-semibold text-sm truncate block hover:underline">
                          {name(f.user)}
                        </Link>
                        <p className="text-xs text-ccb-muted">Waiting for response</p>
                      </div>
                      <button onClick={() => removeFriend(f.user.id)} disabled={sending === f.user.id}
                              className="text-xs text-ccb-muted hover:text-red-400">Cancel</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* challenge time-control picker */}
      {challengeFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => setChallengeFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-ccb-surface border border-ccb-border p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-center mb-1">Challenge {name(challengeFor)}</h3>
            <p className="text-xs text-ccb-muted text-center mb-4">Pick a time control — they&apos;ll get the link in chat.</p>
            <div className="grid grid-cols-2 gap-2">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.key}
                  onClick={() => sendChallenge(challengeFor.id, tc.key)}
                  disabled={sending === challengeFor.id + tc.key}
                  className="flex flex-col items-center gap-0.5 py-3 rounded-xl border border-ccb-border hover:border-ccb-accent hover:bg-ccb-accent/10 transition-colors disabled:opacity-50">
                  {sending === challengeFor.id + tc.key ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span className="text-sm font-semibold">{tc.label}</span>
                      <span className="text-xs text-ccb-muted">{tc.sub}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
            <button onClick={() => setChallengeFor(null)} className="w-full mt-3 py-2 text-sm text-ccb-muted hover:text-ccb-text">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-ccb-text text-ccb-bg text-sm font-medium shadow-lg max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}

"use client";

import CountryFlag from "./country-flag";

// Country name from the ISO alpha-2 code via the browser's built-in
// region display names.
function countryName(code: string): string {
  const clean = (code || "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(clean)) return "";
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(clean.toUpperCase()) || clean.toUpperCase();
  } catch {
    return clean.toUpperCase();
  }
}

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { X, Trophy, Users, Target, Calendar, ChevronRight } from "lucide-react";

interface PlayerProfilePreviewProps {
  userId: string;
  onClose: () => void;
}

export default function PlayerProfilePreview({ userId, onClose }: PlayerProfilePreviewProps) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, rating, games_played, wins, losses, draws, bio, avatar_url, created_at, tournaments_won, country")
        .eq("id", userId)
        .single();

      if (data) {
        setProfile(data);
        // Fetch recent games
        const { data: games } = await supabase
          .from("games")
          .select("id, status, winner, time_control, white_player_id, black_player_id, created_at")
          .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(5);
        setRecentGames(games || []);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [userId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Slight delay to avoid immediate close from the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const getTier = (rating: number) => {
    if (rating >= 2200) return { label: "Master", color: "text-purple-400" };
    if (rating >= 1900) return { label: "Diamond", color: "text-cyan-400" };
    if (rating >= 1600) return { label: "Platinum", color: "text-emerald-400" };
    if (rating >= 1300) return { label: "Gold", color: "text-ccb-accent" };
    if (rating >= 1000) return { label: "Silver", color: "text-ccb-silver" };
    return { label: "Bronze", color: "text-ccb-bronze" };
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40" />
        <div
          ref={ref}
          onClick={(e) => e.stopPropagation()}
          className="relative w-[90%] max-w-[340px] rounded-xl border border-ccb-border bg-ccb-card shadow-2xl p-6"
        >
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-ccb-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40" />
        <div
          ref={ref}
          onClick={(e) => e.stopPropagation()}
          className="relative w-[90%] max-w-[340px] rounded-xl border border-ccb-border bg-ccb-card shadow-2xl p-6 text-center"
        >
          <p className="text-sm text-ccb-muted">Player profile not available.</p>
          <button onClick={onClose} className="mt-3 text-xs text-ccb-primary font-medium">Close</button>
        </div>
      </div>
    );
  }

  const tier = getTier(profile.rating || 1200);
  const winRate = profile.games_played
    ? Math.round((profile.wins / profile.games_played) * 100)
    : 0;
  const joinedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  return (
    <>
      {/* Mobile: bottom sheet style overlay */}
      <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40" />
        <div
          ref={ref}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full rounded-t-2xl border-t border-ccb-border bg-ccb-card shadow-2xl max-h-[70vh] overflow-y-auto no-scrollbar animate-sheet-up"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-ccb-border" />
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2.5 right-3 text-ccb-muted hover:text-ccb-text p-1"
          >
            <X className="w-4 h-4" />
          </button>
          {renderContent(profile, tier, winRate, recentGames, joinedDate)}
        </div>
      </div>

      {/* Desktop: floating card */}
      <div className="hidden lg:flex fixed inset-0 z-50 items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40" />
        <div
          ref={ref}
          onClick={(e) => e.stopPropagation()}
          className="relative w-[360px] rounded-xl border border-ccb-border bg-ccb-card shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 text-ccb-muted hover:text-ccb-text p-1 rounded-md hover:bg-ccb-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {renderContent(profile, tier, winRate, recentGames, joinedDate)}
        </div>
      </div>
    </>
  );
}

function renderContent(profile: any, tier: any, winRate: number, recentGames: any[], joinedDate: string | null) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div className="w-14 h-14 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-ccb-primary">
              {(profile.display_name || profile.username)?.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold truncate flex items-center gap-1.5">
            <span className="truncate">{profile.display_name || profile.username}</span>
            <CountryFlag code={profile.country} className="w-4.5 h-3 shrink-0" />
          </h2>
          <p className="text-xs text-ccb-muted truncate">
            @{profile.username}
            {profile.country && (
              <span> · {countryName(profile.country)}</span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-base font-bold ${tier.color}`}>{profile.rating || 1200}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ccb-surface ${tier.color}`}>
              {tier.label}
            </span>
          </div>
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <p className="text-xs text-ccb-muted px-4 -mt-1 line-clamp-2">{profile.bio}</p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-px bg-ccb-border mx-4 rounded-lg overflow-hidden">
        <div className="bg-ccb-card p-2.5 text-center">
          <Users className="w-3.5 h-3.5 text-ccb-muted mx-auto mb-1" />
          <div className="text-sm font-bold">{profile.games_played || 0}</div>
          <div className="text-[9px] text-ccb-muted">Games</div>
        </div>
        <div className="bg-ccb-card p-2.5 text-center">
          <Target className="w-3.5 h-3.5 text-ccb-muted mx-auto mb-1" />
          <div className="text-sm font-bold text-emerald-500">{winRate}%</div>
          <div className="text-[9px] text-ccb-muted">Win Rate</div>
        </div>
        <div className="bg-ccb-card p-2.5 text-center">
          <Trophy className="w-3.5 h-3.5 text-ccb-muted mx-auto mb-1" />
          <div className="text-sm font-bold text-ccb-accent">{profile.tournaments_won || 0}</div>
          <div className="text-[9px] text-ccb-muted">Titles</div>
        </div>
        <div className="bg-ccb-card p-2.5 text-center">
          <Calendar className="w-3.5 h-3.5 text-ccb-muted mx-auto mb-1" />
          <div className="text-sm font-bold">{joinedDate || "—"}</div>
          <div className="text-[9px] text-ccb-muted">Joined</div>
        </div>
      </div>

      {/* W/L/D breakdown */}
      <div className="flex items-center gap-1.5 px-4">
        <div className="flex-1 text-center py-1.5 rounded-md bg-emerald-500/10">
          <span className="text-sm font-bold text-emerald-500">{profile.wins || 0}</span>
          <span className="text-[10px] text-ccb-muted ml-1">W</span>
        </div>
        <div className="flex-1 text-center py-1.5 rounded-md bg-ccb-muted/10">
          <span className="text-sm font-bold text-ccb-muted">{profile.draws || 0}</span>
          <span className="text-[10px] text-ccb-muted ml-1">D</span>
        </div>
        <div className="flex-1 text-center py-1.5 rounded-md bg-red-500/10">
          <span className="text-sm font-bold text-red-500">{profile.losses || 0}</span>
          <span className="text-[10px] text-ccb-muted ml-1">L</span>
        </div>
      </div>

      {/* Recent games */}
      {recentGames.length > 0 && (
        <div className="px-4 pb-3">
          <div className="text-[10px] font-semibold text-ccb-muted uppercase tracking-wide mb-1.5">Recent Games</div>
          <div className="space-y-1">
            {recentGames.map((g) => {
              const isWhite = g.white_player_id === profile.id;
              const won = g.winner === (isWhite ? "white" : "black");
              const drew = g.status === "draw" || g.status === "stalemate";
              const result = won ? "W" : drew ? "D" : "L";
              const color = won ? "text-emerald-500" : drew ? "text-ccb-muted" : "text-red-500";
              return (
                <div key={g.id} className="flex items-center gap-2 text-xs py-1">
                  <span className={`font-bold w-4 ${color}`}>{result}</span>
                  <span className="text-ccb-muted">{g.time_control || "10+0"}</span>
                  <span className="ml-auto text-ccb-muted text-[10px]">
                    {new Date(g.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View full profile link */}
      <div className="border-t border-ccb-border">
        <Link
          href={`/profile/${profile.username}`}
          className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-ccb-primary hover:bg-ccb-surface transition-colors"
        >
          View Full Profile
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

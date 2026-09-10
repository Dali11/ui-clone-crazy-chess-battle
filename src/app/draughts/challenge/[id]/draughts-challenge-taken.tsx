"use client";

import { useRouter } from "next/navigation";
import { Eye, Swords, Home, Clock } from "lucide-react";
import AdSlot from "@/components/ads/ad-slot";

interface PlayerInfo {
  name: string;
  avatarUrl?: string | null;
  rating?: number | null;
}

interface DraughtsChallengeTakenProps {
  gameId: string;
  white: PlayerInfo;
  black: PlayerInfo;
  timeControl: string;
  moveCount?: number;
}

/** Spectator landing for a draughts challenge link whose game is already in progress. */
export default function DraughtsChallengeTaken({
  gameId,
  white,
  black,
  timeControl,
  moveCount,
}: DraughtsChallengeTakenProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-ccb-border bg-ccb-card shadow-2xl p-5">
        <div className="flex items-center justify-center gap-1.5 mb-4">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-ccb-primary/10 text-ccb-primary">
            <Eye className="w-3 h-3" /> Spectating
          </span>
        </div>

        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="w-12 h-12 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden">
              {white.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={white.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-ccb-muted">{white.name[0]?.toUpperCase()}</span>
              )}
            </div>
            <p className="text-sm font-bold text-ccb-text text-center leading-tight truncate max-w-full">{white.name}</p>
            {white.rating ? <span className="text-[10px] text-ccb-muted">{white.rating}</span> : null}
          </div>

          <div className="flex flex-col items-center shrink-0">
            <Swords className="w-5 h-5 text-ccb-primary" />
          </div>

          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="w-12 h-12 rounded-full bg-ccb-dark border border-ccb-border flex items-center justify-center overflow-hidden">
              {black.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={black.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-white/70">{black.name[0]?.toUpperCase()}</span>
              )}
            </div>
            <p className="text-sm font-bold text-ccb-text text-center leading-tight truncate max-w-full">{black.name}</p>
            {black.rating ? <span className="text-[10px] text-ccb-muted">{black.rating}</span> : null}
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mb-5 text-[10px] text-ccb-muted">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {timeControl}
          </span>
          {moveCount !== undefined && moveCount > 0 && (
            <span>{moveCount} moves played</span>
          )}
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
          </span>
        </div>

        <button
          onClick={() => router.push(`/draughts/game/${gameId}`)}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold bg-ccb-primary text-white hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Eye className="w-4 h-4" /> Watch Match
        </button>

        <button
          onClick={() => router.push("/draughts")}
          className="w-full flex items-center justify-center gap-2 text-xs text-ccb-muted hover:text-ccb-text transition-colors mt-4"
        >
          <Home className="w-3.5 h-3.5" /> Back to Draughts
        </button>

        {/* Admin-managed ad — same non-gameplay spectate placement as the
            live matches list. Renders nothing until enabled + configured.
            Bottom row: under all actions so it never pushes the CTAs. */}
        <div className="mt-5">
          <AdSlot placement="spectate" />
        </div>
      </div>
    </div>
  );
}

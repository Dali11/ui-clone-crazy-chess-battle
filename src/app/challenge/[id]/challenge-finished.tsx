"use client";

import { useRouter } from "next/navigation";
import { Trophy, Handshake, Eye, Home } from "lucide-react";

interface PlayerInfo {
  name: string;
  avatarUrl?: string | null;
  rating?: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  draw: "Draw",
  resign: "Resignation",
  timeout: "Time out",
  abort: "Game Aborted",
  completed: "Game Over",
};

interface ChallengeFinishedProps {
  gameId: string;
  white: PlayerInfo;
  black: PlayerInfo;
  winnerSide: "white" | "black" | null;
  status: string;
  timeControl: string;
}

/**
 * "Victory" landing shown when a visitor opens a challenge link after
 * the game has already finished. Declares the result instead of
 * dumping them on a generic "Challenge Expired" screen. Mirrors the
 * visual language of VictoryOverlay / ChallengeTaken.
 */
export default function ChallengeFinished({
  gameId,
  white,
  black,
  winnerSide,
  status,
  timeControl,
}: ChallengeFinishedProps) {
  const router = useRouter();

  const isDraw = winnerSide === null;
  const winner = winnerSide === "white" ? white : winnerSide === "black" ? black : null;
  const reasonLabel = STATUS_LABELS[status] || "Game Over";

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-ccb-border bg-ccb-card shadow-2xl p-5">
        {/* Result badge */}
        <div className="flex flex-col items-center gap-2 mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            isDraw ? "bg-ccb-muted/10" : "bg-ccb-primary/10"
          }`}>
            {isDraw ? (
              <Handshake className="w-6 h-6 text-ccb-muted" />
            ) : (
              <Trophy className="w-6 h-6 text-ccb-primary" />
            )}
          </div>
          <h1 className="text-base font-bold text-ccb-text text-center">
            {isDraw ? "It's a Draw" : `${winner!.name} Wins`}
          </h1>
          <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">
            {reasonLabel}
          </span>
        </div>

        {/* Matchup */}
        <div className="flex items-center justify-center gap-3 mb-5">
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className={`w-11 h-11 rounded-full bg-ccb-surface border flex items-center justify-center overflow-hidden ${
              winnerSide === "white" ? "border-ccb-primary" : "border-ccb-border"
            }`}>
              {white.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={white.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-ccb-muted">{white.name[0]?.toUpperCase()}</span>
              )}
            </div>
            <p className={`text-xs font-bold text-center leading-tight truncate max-w-full ${
              winnerSide === "white" ? "text-ccb-primary" : "text-ccb-text"
            }`}>{white.name}</p>
          </div>

          <span className="text-[10px] text-ccb-muted shrink-0">vs</span>

          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className={`w-11 h-11 rounded-full bg-ccb-dark border flex items-center justify-center overflow-hidden ${
              winnerSide === "black" ? "border-ccb-primary" : "border-ccb-border"
            }`}>
              {black.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={black.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-white/70">{black.name[0]?.toUpperCase()}</span>
              )}
            </div>
            <p className={`text-xs font-bold text-center leading-tight truncate max-w-full ${
              winnerSide === "black" ? "text-ccb-primary" : "text-ccb-text"
            }`}>{black.name}</p>
          </div>
        </div>

        <p className="text-center text-[10px] text-ccb-muted mb-5">{timeControl}</p>

        {/* Primary action */}
        <button
          onClick={() => router.push(`/game/${gameId}`)}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold bg-ccb-primary text-white hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Eye className="w-4 h-4" /> View Game
        </button>

        {/* Secondary actions */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => router.push("/play")}
            className="flex-1 flex items-center justify-center rounded-xl py-2.5 text-xs font-semibold bg-ccb-surface border border-ccb-border text-ccb-text hover:bg-ccb-surface/70 transition-colors"
          >
            New Game
          </button>
          <button
            onClick={() => router.push("/battles")}
            className="flex-1 flex items-center justify-center rounded-xl py-2.5 text-xs font-semibold bg-ccb-surface border border-ccb-border text-ccb-text hover:bg-ccb-surface/70 transition-colors"
          >
            Staked Battle
          </button>
        </div>

        <button
          onClick={() => router.push("/")}
          className="w-full flex items-center justify-center gap-2 text-xs text-ccb-muted hover:text-ccb-text transition-colors mt-4"
        >
          <Home className="w-3.5 h-3.5" /> Back to Home
        </button>
      </div>
    </div>
  );
}

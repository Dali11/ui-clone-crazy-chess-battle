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
  no_moves: "No Legal Moves",
};

interface DraughtsChallengeFinishedProps {
  gameId: string;
  white: PlayerInfo;
  black: PlayerInfo;
  winnerSide: "white" | "black" | null;
  status: string;
  timeControl: string;
}

/** "Victory" landing for a draughts challenge link opened after the game finished. */
export default function DraughtsChallengeFinished({
  gameId,
  white,
  black,
  winnerSide,
  status,
  timeControl,
}: DraughtsChallengeFinishedProps) {
  const router = useRouter();

  const isDraw = winnerSide === null;
  const winner = winnerSide === "white" ? white : winnerSide === "black" ? black : null;
  const reasonLabel = STATUS_LABELS[status] || "Game Over";

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-ccb-border bg-ccb-card shadow-2xl p-5">
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

        <button
          onClick={() => router.push(`/draughts/game/${gameId}`)}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold bg-ccb-primary text-white hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Eye className="w-4 h-4" /> View Game
        </button>

        <button
          onClick={() => router.push("/draughts")}
          className="w-full flex items-center justify-center gap-2 text-xs text-ccb-muted hover:text-ccb-text transition-colors mt-4"
        >
          <Home className="w-3.5 h-3.5" /> Back to Draughts
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { X, Crown, Swords, Loader2, AlertCircle, Trophy, Hash } from "lucide-react";

/**
 * GameDetailModal — drilldown view for a single chess or draughts game:
 * players, linked wagered battle (stake/pot/fee/payout), metadata and
 * the full move history. Optional hook into the existing result-override
 * flow for dispute resolution.
 */

export interface GameDetailModalProps {
  gameId: string;
  engine: "chess" | "draughts";
  onClose: () => void;
  onResultOverride?: (game: any) => void;
  formatMWK?: (n: number) => string;
}

interface PlayerSubset {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number;
}

interface GameDetailData {
  game: any;
  white: PlayerSubset;
  black: PlayerSubset;
  battle: any | null;
  moves: string[];
}

export default function GameDetailModal({
  gameId,
  engine,
  onClose,
  onResultOverride,
  formatMWK,
}: GameDetailModalProps) {
  const [data, setData] = useState<GameDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const money = (n: number | null | undefined) =>
    n == null ? "N/A" : (formatMWK ? formatMWK(n) : `MWK ${n.toLocaleString()}`);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/admin/games/${gameId}?engine=${engine}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((resData) => {
        if (!isMounted) return;
        if (resData.error) throw new Error(resData.error);
        setData(resData);
      })
      .catch((err: any) => {
        if (isMounted) setError(err.message || "Failed to load game");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [gameId, engine]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pairedMoves: [string, string?][] = [];
  if (data?.moves) {
    for (let i = 0; i < data.moves.length; i += 2) {
      pairedMoves.push([data.moves[i], data.moves[i + 1]]);
    }
  }

  const game = data?.game;
  const battle = data?.battle;
  const isWhiteWinner = game?.winner === "white";
  const isBlackWinner = game?.winner === "black";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-ccb-border bg-ccb-card shadow-2xl p-5 flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-ccb-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-ccb-primary/20 text-ccb-primary border border-ccb-primary/30">
              {engine}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              game?.status === "checkmate" || game?.status === "win" || game?.status === "resign" || game?.status === "timeout"
                ? "bg-ccb-success/20 text-ccb-success"
                : game?.status === "draw"
                ? "bg-ccb-accent/20 text-ccb-accent"
                : "bg-ccb-border text-ccb-muted"
            }`}>
              {game?.status || "Loading..."}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-ccb-muted hover:text-ccb-text hover:bg-ccb-border/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-ccb-muted">
              <Loader2 className="w-8 h-8 animate-spin mb-2 text-ccb-primary" />
              <p className="text-sm">Loading game details...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-ccb-danger/10 border border-ccb-danger/20 text-ccb-danger text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          ) : data && game ? (
            <>
              {/* Player cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-3 rounded-xl border ${isWhiteWinner ? "border-ccb-accent bg-ccb-accent/5" : "border-ccb-border bg-ccb-card"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-ccb-muted tracking-wider">White</span>
                    {isWhiteWinner && <Crown className="w-4 h-4 text-ccb-accent" />}
                  </div>
                  <p className="text-sm font-bold text-ccb-text mt-1 truncate">
                    {data.white.display_name || data.white.username}
                  </p>
                  <p className="text-xs text-ccb-muted">
                    @{data.white.username} · Rating: <span className="text-ccb-text font-semibold">{data.white.rating}</span>
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${isBlackWinner ? "border-ccb-accent bg-ccb-accent/5" : "border-ccb-border bg-ccb-card"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-ccb-muted tracking-wider">Black</span>
                    {isBlackWinner && <Crown className="w-4 h-4 text-ccb-accent" />}
                  </div>
                  <p className="text-sm font-bold text-ccb-text mt-1 truncate">
                    {data.black.display_name || data.black.username}
                  </p>
                  <p className="text-xs text-ccb-muted">
                    @{data.black.username} · Rating: <span className="text-ccb-text font-semibold">{data.black.rating}</span>
                  </p>
                </div>
              </div>

              {/* Linked battle */}
              {battle && (
                <div className="p-3 rounded-xl border border-ccb-accent/30 bg-ccb-accent/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-ccb-accent">
                      <Swords className="w-4 h-4" />
                      Linked Battle
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      battle.settled ? "bg-ccb-success/20 text-ccb-success" : "bg-ccb-accent/20 text-ccb-accent"
                    }`}>
                      {battle.settled ? "Settled" : "Escrow Locked"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                    <div>
                      <p className="text-[10px] text-ccb-muted">Stake</p>
                      <p className="font-semibold text-ccb-text">{money(battle.stake)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ccb-muted">Total Pot</p>
                      <p className="font-semibold text-ccb-text">{money(battle.pot)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ccb-muted">Platform Fee</p>
                      <p className="font-semibold text-ccb-text">{money(battle.platform_fee)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ccb-muted">Winner Payout</p>
                      <p className="font-semibold text-ccb-success">{money(battle.winner_payout)}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-ccb-muted">
                    Battle status: {battle.status}{battle.result ? ` · result: ${battle.result}` : ""}
                  </p>
                </div>
              )}

              {/* Metadata */}
              <div className="p-3 rounded-xl border border-ccb-border bg-ccb-card grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-[10px] text-ccb-muted">Time Control</p>
                  <p className="font-semibold capitalize text-ccb-text">{game.time_control || "Standard"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-ccb-muted">Rated</p>
                  <p className="font-semibold text-ccb-text">{game.rated ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-ccb-muted">Created</p>
                  <p className="font-semibold text-ccb-text">{formatDate(game.created_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-ccb-muted">Completed</p>
                  <p className="font-semibold text-ccb-text">{formatDate(game.ended_at)}</p>
                </div>
                {game.opening && (
                  <div className="col-span-2 sm:col-span-4">
                    <p className="text-[10px] text-ccb-muted">Opening</p>
                    <p className="font-semibold text-ccb-text truncate">{game.opening}</p>
                  </div>
                )}
              </div>

              {/* Move history */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-ccb-text flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-ccb-primary" />
                    Move History ({data.moves.length} moves)
                  </h4>
                </div>
                {pairedMoves.length === 0 ? (
                  <p className="text-xs text-ccb-muted italic py-3 text-center border border-ccb-border rounded-xl bg-ccb-card">
                    No moves recorded
                  </p>
                ) : (
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-ccb-border bg-ccb-card p-2 text-xs">
                    <div className="grid grid-cols-3 font-semibold text-ccb-muted border-b border-ccb-border pb-1 px-2 mb-1 text-[11px]">
                      <span>#</span>
                      <span>White</span>
                      <span>Black</span>
                    </div>
                    <div className="space-y-0.5">
                      {pairedMoves.map(([whiteMove, blackMove], idx) => (
                        <div key={idx} className="grid grid-cols-3 px-2 py-0.5 rounded hover:bg-ccb-surface/50 font-mono text-[11px]">
                          <span className="text-ccb-muted">{idx + 1}.</span>
                          <span className="text-ccb-text font-medium">{whiteMove}</span>
                          <span className="text-ccb-text font-medium">{blackMove || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-ccb-border shrink-0">
          {onResultOverride && game && (
            <button
              onClick={() => onResultOverride(game)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-ccb-accent text-black hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <Trophy className="w-3.5 h-3.5" />
              Result Override
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-ccb-surface border border-ccb-border text-ccb-text hover:bg-ccb-border/50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

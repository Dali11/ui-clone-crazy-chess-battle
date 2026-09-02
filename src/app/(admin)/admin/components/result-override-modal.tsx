"use client";

import { useState } from "react";
import { X, Crown, Handshake, AlertTriangle, Loader2 } from "lucide-react";
import type { GameInfo } from "../types";

interface ResultOverrideModalProps {
  game: GameInfo | null;
  onClose: () => void;
  onConfirm: (winner: "white" | "black" | "draw") => Promise<void>;
}

export default function ResultOverrideModal({ game, onClose, onConfirm }: ResultOverrideModalProps) {
  const [selected, setSelected] = useState<"white" | "black" | "draw" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!game) return null;

  const isCorrecting = game.status === "completed" || game.status === "draw";
  const whiteName = game.white_username || "White";
  const blackName = game.black_username || "Black";

  const handleConfirm = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to set result");
    } finally {
      setLoading(false);
    }
  };

  const options: { key: "white" | "black" | "draw"; label: string; sub: string; icon: typeof Crown }[] = [
    { key: "white", label: `${whiteName} Wins`, sub: "White", icon: Crown },
    { key: "black", label: `${blackName} Wins`, sub: "Black", icon: Crown },
    { key: "draw", label: "Draw", sub: "Tie", icon: Handshake },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-ccb-border bg-ccb-card shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-ccb-text">
            {isCorrecting ? "Correct Result" : "Set Result"}
          </h3>
          <button onClick={onClose} className="text-ccb-muted hover:text-ccb-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isCorrecting && (
          <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-[11px] text-amber-400">
              This game already has a result. Overriding will replace it and re-settle any linked battle.
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 mb-4 text-xs">
          <span className="font-bold text-ccb-text">{whiteName}</span>
          <span className="text-ccb-muted">vs</span>
          <span className="font-bold text-ccb-text">{blackName}</span>
        </div>

        <div className="space-y-2 mb-4">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selected === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setSelected(opt.key)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isSelected
                    ? "border-ccb-primary bg-ccb-primary/10"
                    : "border-ccb-border bg-ccb-surface hover:border-ccb-primary/30"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isSelected ? "bg-ccb-primary text-white" : "bg-ccb-surface border border-ccb-border text-ccb-muted"
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className={`text-sm font-bold ${isSelected ? "text-ccb-primary" : "text-ccb-text"}`}>
                    {opt.label}
                  </p>
                  <p className="text-[10px] text-ccb-muted">{opt.sub}</p>
                </div>
                {isSelected && (
                  <div className="ml-auto w-4 h-4 rounded-full bg-ccb-primary flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-xs text-ccb-danger mb-3">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-ccb-surface border border-ccb-border text-ccb-text hover:bg-ccb-surface/70 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || loading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-ccb-primary text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isCorrecting ? "Override" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { memo } from "react";
import { Clock } from "lucide-react";
import CapturedPieces from "./captured-pieces";
import CountryFlag from "./country-flag";

export interface PlayerBarData {
  name: string;
  userId?: string;
  avatar?: string | null;
  country?: string | null;
  rating?: number | string | null;
  ratingChange?: number | null;
  captured: string[];
  advantage: number;
  clock: string;
  isActive: boolean;
  symbol: string;
}

interface PlayerBarProps extends PlayerBarData {
  gameEnded: boolean;
  onPreview: (userId: string) => void;
}

function PlayerBarBase({ name, userId, avatar, country, rating, ratingChange, captured, advantage, clock, isActive, symbol, gameEnded, onPreview }: PlayerBarProps) {
  return (
    <div className={`flex items-center justify-between max-w-[600px] mx-auto w-full px-2 py-2 rounded-lg transition-colors ${isActive ? "bg-ccb-primary/8" : ""}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Avatar circle — chess.com style */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${isActive ? "border-ccb-primary bg-ccb-primary/15" : "border-ccb-border bg-ccb-surface"}`}>
          {avatar ? (
            <img src={avatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-lg">{symbol}</span>
          )}
        </div>
        {/* Country flag — multinational platform, shown right after the avatar */}
        <CountryFlag code={country} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <button onClick={() => userId && onPreview(userId)} className="text-sm font-semibold leading-tight truncate hover:text-ccb-primary transition-colors cursor-pointer bg-transparent border-0 p-0 m-0 text-inherit text-left">{name}</button>
            {rating != null && (
              <span className="text-sm text-ccb-muted/80 shrink-0 flex items-center gap-0.5 font-medium">
                ({rating}
                {gameEnded && typeof ratingChange === "number" && ratingChange !== 0 && (
                  <span className={ratingChange > 0 ? "text-emerald-500 font-semibold" : "text-ccb-danger font-semibold"}>
                    {ratingChange > 0 ? `+${ratingChange}` : ratingChange}
                  </span>
                )}
                )
              </span>
            )}
          </div>
          <CapturedPieces pieces={captured} advantage={advantage} perspective="top" />
        </div>
      </div>
      {/* Clock pill — chess.com style */}
      <div className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-mono text-xl font-bold transition-all shrink-0 ${
        isActive
          ? "bg-ccb-surface text-ccb-text shadow-md ring-1 ring-ccb-primary/30"
          : "bg-ccb-surface/60 text-ccb-muted"
      }`}>
        <Clock className={`w-4 h-4 ${isActive ? "text-ccb-primary" : "text-ccb-muted"}`} />
        {clock}
      </div>
    </div>
  );
}

const PlayerBar = memo(PlayerBarBase);
export default PlayerBar;

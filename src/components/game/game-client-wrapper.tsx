"use client";

import dynamic from "next/dynamic";
import type { GameState } from "@/hooks/use-realtime-game";

const GameClient = dynamic(
  () => import("./game-client"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-ccb-muted">Loading game...</div>
      </div>
    ),
  }
);

export interface BattleInfo {
  isBattle: boolean;
  stake: number;
  winnerPayout: number;
  winnerId: string | null;
}

export default function GameClientWrapper(props: {
  gameId: string;
  initialGame: GameState;
  currentUserId: string;
  isSpectator: boolean;
  whiteName: string;
  blackName: string;
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
  whiteCountry?: string | null;
  blackCountry?: string | null;
  battleInfo?: BattleInfo | null;
  tournamentId?: string | null;
  countryCode?: string | null;
}) {
  return <GameClient {...props} />;
}

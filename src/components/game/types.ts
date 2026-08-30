import type { GameState } from "@/hooks/use-realtime-game";
import type { RematchState } from "./victory-overlay";

export interface BattleInfo {
  isBattle: boolean;
  battleId?: string;
  stake: number;
  winnerPayout: number;
  winnerId: string | null;
  isArmageddon?: boolean;
}

export interface GameClientProps {
  gameId: string;
  initialGame: GameState;
  currentUserId: string;
  isSpectator?: boolean;
  whiteName?: string;
  blackName?: string;
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
  battleInfo?: BattleInfo | null;
  tournamentId?: string | null;
}

export const STATUS_LABELS: Record<string, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  draw: "Draw",
  resign: "Resignation",
  timeout: "Time out",
  abort: "Game Aborted — first move not made",
};

export type SheetType = "chat" | "theme" | "menu" | null;

export type { RematchState };

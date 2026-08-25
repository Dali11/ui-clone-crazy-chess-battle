"use client";

import dynamic from "next/dynamic";
import type { AIDifficulty } from "@/lib/game/draughts-ai";
import type { Variant } from "@/lib/game/draughts-engine";

const DraughtsComputerGame = dynamic(() => import("./draughts-computer-game"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-pulse text-ccb-muted">Loading game...</div>
    </div>
  ),
});

export default function DraughtsComputerGameWrapper(props: {
  difficulty: AIDifficulty;
  playerColor: "white" | "black";
  initialMinutes: number;
  incrementSeconds: number;
  variant: Variant;
}) {
  return <DraughtsComputerGame {...props} />;
}

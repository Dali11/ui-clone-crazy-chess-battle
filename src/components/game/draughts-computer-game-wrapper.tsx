"use client";

import dynamic from "next/dynamic";
import type { AIDifficulty } from "@/lib/game/draughts-ai";

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
}) {
  return <DraughtsComputerGame {...props} />;
}

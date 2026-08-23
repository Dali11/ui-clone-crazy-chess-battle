"use client";

import { useRouter } from "next/navigation";
import { Eye, Swords, Target, Home } from "lucide-react";

interface ChallengeTakenProps {
  gameId: string;
  challengerName: string;
  acceptorName: string;
  timeControl: string;
}

export default function ChallengeTaken({
  gameId,
  challengerName,
  acceptorName,
  timeControl,
}: ChallengeTakenProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4 py-8">
      <div className="card max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-ccb-primary/10 flex items-center justify-center">
            <Swords className="w-8 h-8 text-ccb-primary" />
          </div>
          <h1 className="text-xl font-bold">Game Already Started!</h1>
          <p className="text-sm text-ccb-muted">
            <span className="font-semibold text-foreground">{challengerName}</span> vs{" "}
            <span className="font-semibold text-foreground">{acceptorName}</span> · {timeControl}
          </p>
          <p className="text-xs text-ccb-muted/70">
            This challenge was already accepted. Here's what you can do:
          </p>
        </div>

        <div className="space-y-3">
          {/* Watch as spectator */}
          <button
            onClick={() => router.push(`/game/${gameId}`)}
            className="w-full flex items-center gap-3 rounded-xl border border-ccb-border bg-ccb-card p-4 text-left hover:border-ccb-primary/40 hover:bg-ccb-surface transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-ccb-primary/10 flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5 text-ccb-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Watch the Match</div>
              <div className="text-xs text-ccb-muted">Spectate the ongoing game live</div>
            </div>
          </button>

          {/* Play a new game */}
          <button
            onClick={() => router.push("/play")}
            className="w-full flex items-center gap-3 rounded-xl border border-ccb-border bg-ccb-card p-4 text-left hover:border-ccb-accent/40 hover:bg-ccb-surface transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-ccb-accent/10 flex items-center justify-center shrink-0">
              <Swords className="w-5 h-5 text-ccb-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Play a New Game</div>
              <div className="text-xs text-ccb-muted">Find a quick match or create a new challenge</div>
            </div>
          </button>

          {/* Create a battle */}
          <button
            onClick={() => router.push("/battles")}
            className="w-full flex items-center gap-3 rounded-xl border border-ccb-border bg-ccb-card p-4 text-left hover:border-ccb-danger/40 hover:bg-ccb-surface transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-ccb-danger/10 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-ccb-danger" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Create a Staked Battle</div>
              <div className="text-xs text-ccb-muted">Challenge someone with money on the line</div>
            </div>
          </button>
        </div>

        <button
          onClick={() => router.push("/")}
          className="w-full flex items-center justify-center gap-2 text-sm text-ccb-muted hover:text-ccb-text transition-colors"
        >
          <Home className="w-4 h-4" /> Back to Home
        </button>
      </div>
    </div>
  );
}

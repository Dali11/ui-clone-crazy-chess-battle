"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Swords, Clock, Star, Loader2 } from "lucide-react";
import AdSlot from "@/components/ads/ad-slot";

interface ChallengeAcceptProps {
  challengeId: string;
  challengerName: string;
  challengerRating: number;
  timeControl: string;
  rated: boolean;
}

export default function ChallengeAccept({
  challengeId,
  challengerName,
  challengerRating,
  timeControl,
  rated,
}: ChallengeAcceptProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/challenge/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to accept challenge");
      }

      // Redirect to the game
      router.push(`/game/${data.gameId}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="card max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-ccb-primary/10 flex items-center justify-center">
            <Swords className="w-8 h-8 text-ccb-primary" />
          </div>
          <h1 className="text-xl font-bold">You've Been Challenged!</h1>
          <p className="text-sm text-ccb-muted">
            <span className="font-semibold text-foreground">{challengerName}</span> ({challengerRating}) wants to play
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3 text-center">
            <Clock className="w-5 h-5 mx-auto text-ccb-muted mb-1" />
            <div className="text-xs text-ccb-muted">Time Control</div>
            <div className="font-semibold">{timeControl}</div>
          </div>
          <div className="card p-3 text-center">
            <Star className="w-5 h-5 mx-auto text-ccb-muted mb-1" />
            <div className="text-xs text-ccb-muted">Mode</div>
            <div className="font-semibold">{rated ? "Ranked" : "Casual"}</div>
          </div>
        </div>

        {error && (
          <div className="text-sm text-ccb-danger bg-ccb-danger/10 border border-ccb-danger/20 rounded-lg p-3">
            {error}
          </div>
        )}

        {/* Admin-managed ad — pre-game decision screen, not a money/stake
            screen (casual/ranked only, no wagers here). Uses the lobby
            placement since it's the equivalent of a pre-game waiting page. */}
        <AdSlot placement="lobby" />

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/play")}
            className="btn-secondary flex-1"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Swords className="w-4 h-4" />
                <span>Accept Challenge</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

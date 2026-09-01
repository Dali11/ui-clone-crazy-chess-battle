"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RematchState } from "@/components/game/victory-overlay";

interface IncomingRematch {
  offerId: string;
  fromGameId: string;
  stake?: number;
  error?: string;
}

interface UseRematchOptions {
  gameId: string;
  gameEnded: boolean;
  isSpectator: boolean;
}

export function useRematch({ gameId, gameEnded, isSpectator }: UseRematchOptions) {
  const [rematchState, setRematchState] = useState<RematchState>({ status: "idle" });
  const [rematchStake, setRematchStake] = useState<number>(0);
  const [incomingRematch, setIncomingRematch] = useState<IncomingRematch | null>(null);
  const rematchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const incomingRematchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRematch = useCallback(async () => {
    if (rematchState.status === "sending" || rematchState.status === "waiting") return;
    setRematchState({ status: "sending" });
    try {
      const res = await fetch("/api/game/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.stake && data.stake > 0) setRematchStake(data.stake);
        if (data.offerId) {
          setRematchState({ status: "waiting", offerId: data.offerId });
          rematchPollRef.current = setInterval(async () => {
            try {
              const pollRes = await fetch(`/api/game/rematch?offerId=${data.offerId}`);
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData.status === "accepted" && pollData.new_game_id) {
                  if (rematchPollRef.current) clearInterval(rematchPollRef.current);
                  setRematchState({ status: "accepted", offerId: data.offerId, gameId: pollData.new_game_id });
                  setTimeout(() => { window.location.href = `/game/${pollData.new_game_id}`; }, 1500);
                } else if (pollData.status === "declined") {
                  if (rematchPollRef.current) clearInterval(rematchPollRef.current);
                  setRematchState({ status: "declined", offerId: data.offerId });
                } else if (pollData.status === "cancelled" || pollData.status === "expired") {
                  if (rematchPollRef.current) clearInterval(rematchPollRef.current);
                  setRematchState({ status: pollData.status === "expired" ? "expired" : "cancelled", offerId: data.offerId });
                }
              }
            } catch {}
          }, 2000);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData.insufficientFunds) {
          alert(errData.error || "Insufficient balance for a staked rematch.");
        }
        setRematchState({ status: "idle" });
      }
    } catch {
      setRematchState({ status: "idle" });
    }
  }, [rematchState.status, gameId]);

  const handleCancelRematch = useCallback(async () => {
    const currentOfferId = rematchState.offerId;
    if (!currentOfferId) return;
    try {
      await fetch("/api/game/rematch/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: currentOfferId }),
      });
    } catch {}
    if (rematchPollRef.current) clearInterval(rematchPollRef.current);
    setRematchState({ status: "cancelled" });
  }, [rematchState.offerId]);

  const handleAcceptIncomingRematch = useCallback(async () => {
    if (!incomingRematch) return;
    try {
      const res = await fetch("/api/game/rematch/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: incomingRematch.offerId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.gameId) {
          if (incomingRematchRef.current) clearInterval(incomingRematchRef.current);
          setIncomingRematch(null);
          window.location.href = `/game/${data.gameId}`;
        }
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.insufficientFunds) {
          setIncomingRematch((prev) => prev ? { ...prev, error: data.error || "Insufficient balance for staked rematch." } : prev);
          return;
        }
        setIncomingRematch((prev) => prev ? { ...prev, error: data.error || "Failed to accept rematch." } : prev);
      }
    } catch {}
  }, [incomingRematch]);

  const handleDeclineIncomingRematch = useCallback(async () => {
    if (!incomingRematch) return;
    try {
      await fetch("/api/game/rematch/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: incomingRematch.offerId }),
      });
    } catch {}
    if (incomingRematchRef.current) clearInterval(incomingRematchRef.current);
    setIncomingRematch(null);
  }, [incomingRematch]);

  // Cleanup polling on unmount — also cancel/expire any pending rematch offers
  useEffect(() => {
    return () => {
      if (rematchPollRef.current) clearInterval(rematchPollRef.current);
      if (incomingRematchRef.current) clearInterval(incomingRematchRef.current);

      if (rematchState.status === "waiting" && rematchState.offerId) {
        fetch("/api/game/rematch/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offerId: rematchState.offerId }),
        }).catch(() => {});
      }

      if (incomingRematch) {
        fetch("/api/game/rematch/decline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offerId: incomingRematch.offerId }),
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for incoming rematch offers when game ends
  useEffect(() => {
    if (!gameEnded || isSpectator || rematchState.status === "waiting" || rematchState.status === "sending") {
      if (incomingRematchRef.current) {
        clearInterval(incomingRematchRef.current);
        incomingRematchRef.current = null;
      }
      return;
    }

    const checkIncoming = async () => {
      try {
        const res = await fetch(`/api/game/rematch/incoming?gameId=${gameId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.offer && data.offer.status === "pending") {
            setIncomingRematch({ offerId: data.offer.id, fromGameId: data.offer.from_game_id, stake: data.offer.stake || 0 });
          } else if (data.offer && data.offer.status !== "pending") {
            setIncomingRematch(null);
            if (incomingRematchRef.current) {
              clearInterval(incomingRematchRef.current);
              incomingRematchRef.current = null;
            }
            if (data.offer.status === "accepted" && data.offer.new_game_id) {
              window.location.href = `/game/${data.offer.new_game_id}`;
            }
          }
        }
      } catch {}
    };

    checkIncoming();
    incomingRematchRef.current = setInterval(checkIncoming, 3000);
    return () => {
      if (incomingRematchRef.current) clearInterval(incomingRematchRef.current);
      incomingRematchRef.current = null;
    };
  }, [gameEnded, isSpectator, gameId, rematchState.status]);

  return {
    rematchState,
    rematchStake,
    incomingRematch,
    handleRematch,
    handleCancelRematch,
    handleAcceptIncomingRematch,
    handleDeclineIncomingRematch,
  };
}

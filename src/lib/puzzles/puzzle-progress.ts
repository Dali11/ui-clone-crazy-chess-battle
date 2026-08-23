"use client";

import { useState, useEffect, useCallback } from "react";

export interface PuzzleProgressData {
  solved: string[];
  failed: string[];
  attempts: Record<string, number>;
  streak: number;
  bestStreak: number;
  totalSolved: number;
}

const STORAGE_KEY = "ccb-puzzle-progress";

const defaultProgress: PuzzleProgressData = {
  solved: [],
  failed: [],
  attempts: {},
  streak: 0,
  bestStreak: 0,
  totalSolved: 0,
};

function loadProgress(): PuzzleProgressData {
  if (typeof window === "undefined") return defaultProgress;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress;
    return { ...defaultProgress, ...JSON.parse(raw) };
  } catch {
    return defaultProgress;
  }
}

function saveProgress(data: PuzzleProgressData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function usePuzzleProgress() {
  const [progress, setProgress] = useState<PuzzleProgressData>(defaultProgress);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const markSolved = useCallback((puzzleId: string) => {
    setProgress((prev) => {
      const next = { ...prev };
      if (!next.solved.includes(puzzleId)) {
        next.solved = [...next.solved, puzzleId];
        next.totalSolved = next.solved.length;
      }
      next.streak = prev.streak + 1;
      next.bestStreak = Math.max(prev.bestStreak, next.streak);
      next.attempts = { ...prev.attempts, [puzzleId]: (prev.attempts[puzzleId] || 0) + 1 };
      saveProgress(next);
      return next;
    });
  }, []);

  const markFailed = useCallback((puzzleId: string) => {
    setProgress((prev) => {
      const next = {
        ...prev,
        streak: 0,
        attempts: { ...prev.attempts, [puzzleId]: (prev.attempts[puzzleId] || 0) + 1 },
      };
      if (!next.failed.includes(puzzleId)) {
        next.failed = [...next.failed, puzzleId];
      }
      saveProgress(next);
      return next;
    });
  }, []);

  const resetProgress = useCallback(() => {
    saveProgress(defaultProgress);
    setProgress(defaultProgress);
  }, []);

  return { progress, markSolved, markFailed, resetProgress };
}

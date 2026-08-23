"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PuzzleProgressData {
  solved: Set<string>;
  attempts: Record<string, number>;
  streak: number;
  bestStreak: number;
  totalSolved: number;
  highestLevelUnlocked: number;
}

export interface LevelProgress {
  level: number;
  solved: number;
  total: number;
  isComplete: boolean;
  isUnlocked: boolean;
}

const defaultProgress: PuzzleProgressData = {
  solved: new Set<string>(),
  attempts: {},
  streak: 0,
  bestStreak: 0,
  totalSolved: 0,
  highestLevelUnlocked: 1,
};

export function usePuzzleProgress() {
  const supabase = createClient();
  const [progress, setProgress] = useState<PuzzleProgressData>(defaultProgress);
  const [loaded, setLoaded] = useState(false);
  const pendingSaves = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoaded(true); return; }

        const { data: records, error } = await supabase
          .from("puzzle_progress")
          .select("puzzle_id, status, attempts, level")
          .eq("user_id", user.id);

        if (error || !records) { setLoaded(true); return; }

        const solved = new Set<string>();
        const attempts: Record<string, number> = {};
        let highestLevel = 1;

        for (const r of records) {
          if (r.status === "solved") solved.add(r.puzzle_id);
          attempts[r.puzzle_id] = r.attempts || 0;
        }

        // Calculate highest unlocked level from puzzle IDs (lN-...)
        for (const pid of solved) {
          const m = pid.match(/^l(\d+)-/);
          if (m) {
            const lvl = parseInt(m[1]);
            if (lvl >= highestLevel) highestLevel = lvl + 1;
          }
        }
        if (highestLevel > 10) highestLevel = 10;

        if (!mounted) return;
        setProgress({
          solved,
          attempts,
          streak: 0,
          bestStreak: 0,
          totalSolved: solved.size,
          highestLevelUnlocked: highestLevel,
        });
      } catch {}
      setLoaded(true);
    })();
    return () => { mounted = false; };
  }, [supabase]);

  const markSolved = useCallback((puzzleId: string, level: number) => {
    if (pendingSaves.current.has(puzzleId)) return;
    pendingSaves.current.add(puzzleId);

    setProgress((prev) => {
      const solved = new Set(prev.solved);
      const wasAlreadySolved = solved.has(puzzleId);
      solved.add(puzzleId);
      const newStreak = prev.streak + 1;
      const newHighest = Math.max(prev.highestLevelUnlocked, level + 1 > 10 ? 10 : level + 1);
      return {
        ...prev,
        solved,
        streak: newStreak,
        bestStreak: Math.max(prev.bestStreak, newStreak),
        totalSolved: solved.size,
        highestLevelUnlocked: newHighest,
      };
    });

    // Save to Supabase (upsert)
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const currentAttempts = (progress.attempts[puzzleId] || 0) + 1;
        await supabase
          .from("puzzle_progress")
          .upsert({
            user_id: user.id,
            puzzle_id: puzzleId,
            level,
            status: "solved",
            attempts: currentAttempts,
            solved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,puzzle_id" });
      } catch {} finally {
        pendingSaves.current.delete(puzzleId);
      }
    })();
  }, [supabase, progress.attempts]);

  const markFailed = useCallback((puzzleId: string, level: number) => {
    setProgress((prev) => ({
      ...prev,
      streak: 0,
      attempts: { ...prev.attempts, [puzzleId]: (prev.attempts[puzzleId] || 0) + 1 },
    }));

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase
          .from("puzzle_progress")
          .upsert({
            user_id: user.id,
            puzzle_id: puzzleId,
            level,
            status: "unsolved",
            attempts: (progress.attempts[puzzleId] || 0) + 1,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,puzzle_id" });
      } catch {}
    })();
  }, [supabase, progress.attempts]);

  const resetProgress = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("puzzle_progress").delete().eq("user_id", user.id);
    } catch {}
    setProgress(defaultProgress);
  }, [supabase]);

  return { progress, loaded, markSolved, markFailed, resetProgress };
}

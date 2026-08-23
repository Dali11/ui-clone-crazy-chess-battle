"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, Check, Flame, Lock, Trophy, Star, Loader2, Play } from "lucide-react";
import { puzzleLevels, type PuzzleLevel, type ChessPuzzle } from "@/lib/puzzles/puzzle-data";
import { usePuzzleProgress } from "@/lib/puzzles/puzzle-progress";
import PuzzleBoard from "@/components/puzzles/puzzle-board";

type View = "levels" | "playing";

export default function PuzzlesPage() {
  const [view, setView] = useState<View>("levels");
  const [activeLevel, setActiveLevel] = useState<PuzzleLevel | null>(null);
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const { progress, loaded, markSolved, markFailed } = usePuzzleProgress();

  const currentPuzzle = activeLevel?.puzzles[puzzleIdx];
  const hasNext = activeLevel && puzzleIdx < activeLevel.puzzles.length - 1;

  const handleNext = () => {
    if (hasNext) setPuzzleIdx(puzzleIdx + 1);
  };

  const startLevel = (level: PuzzleLevel) => {
    if (level.level > progress.highestLevelUnlocked) return;
    setActiveLevel(level);
    setPuzzleIdx(0);
    setView("playing");
  };

  const backToLevels = () => {
    setView("levels");
    setActiveLevel(null);
    setPuzzleIdx(0);
  };

  const completionPct = Math.round((progress.totalSolved / 50) * 100);
  const levelsCompleted = puzzleLevels.filter((l) => {
    const solvedInLevel = l.puzzles.filter((p) => progress.solved.has(p.id)).length;
    return solvedInLevel === l.puzzles.length;
  }).length;

  if (view === "playing" && activeLevel && currentPuzzle) {
    const solvedInLevel = activeLevel.puzzles.filter((p) => progress.solved.has(p.id)).length;

    return (
      <div className="space-y-4 pb-24 sm:pb-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={backToLevels}
            className="flex items-center gap-1 text-sm text-ccb-muted hover:text-ccb-text transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Levels</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-bold text-sm">
              <span className="w-6 h-6 rounded-lg bg-ccb-primary/15 text-ccb-primary flex items-center justify-center text-xs font-bold">
                {activeLevel.level}
              </span>
              {activeLevel.name}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="text-ccb-muted">{solvedInLevel}/{activeLevel.puzzles.length}</span>
            <span className="flex items-center gap-1 text-orange-400">
              <Flame className="w-3.5 h-3.5" />
              <span className="font-bold">{progress.streak}</span>
            </span>
          </div>
        </div>

        {/* Level progress bar */}
        <div className="w-full h-1.5 rounded-full bg-ccb-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-ccb-primary transition-all duration-500"
            style={{ width: `${(solvedInLevel / activeLevel.puzzles.length) * 100}%` }}
          />
        </div>

        {/* Puzzle board */}
        <PuzzleBoard
          puzzle={currentPuzzle}
          onSolved={() => markSolved(currentPuzzle.id, activeLevel.level)}
          onFailed={() => markFailed(currentPuzzle.id, activeLevel.level)}
          onNext={handleNext}
          hasNext={!!hasNext}
          puzzleNumber={puzzleIdx + 1}
          totalPuzzles={activeLevel.puzzles.length}
        />

        {/* Level complete */}
        {solvedInLevel === activeLevel.puzzles.length && puzzleIdx === activeLevel.puzzles.length - 1 && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <Trophy className="w-5 h-5" />
              <span className="font-bold">Level {activeLevel.level} Complete!</span>
            </div>
            <button onClick={backToLevels} className="btn-primary px-6 py-3 text-sm">
              Back to Levels
            </button>
          </div>
        )}
      </div>
    );
  }

  // Levels overview
  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-ccb-primary animate-spin mb-3" />
        <p className="text-sm text-ccb-muted">Loading puzzles...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Chess Puzzles</h1>
        <p className="text-sm text-ccb-muted mt-1">Climb through 10 levels of tactical mastery</p>
      </div>

      {/* Overall progress */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-ccb-primary" />
            <span className="text-sm font-semibold">Overall Progress</span>
          </div>
          <span className="text-sm font-bold text-ccb-primary">{completionPct}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-ccb-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ccb-primary to-purple-500 transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-ccb-muted">
          <span>{progress.totalSolved} solved</span>
          <span>{levelsCompleted}/10 levels done</span>
          <span className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-orange-400" />
            Best: {progress.bestStreak}
          </span>
        </div>
      </div>

      {/* Level grid */}
      <div className="space-y-3">
        {puzzleLevels.map((level) => {
          const solvedInLevel = level.puzzles.filter((p) => progress.solved.has(p.id)).length;
          const isComplete = solvedInLevel === level.puzzles.length;
          const isUnlocked = level.level <= progress.highestLevelUnlocked;
          const pct = Math.round((solvedInLevel / level.puzzles.length) * 100);

          return (
            <button
              key={level.level}
              onClick={() => startLevel(level)}
              disabled={!isUnlocked}
              className={`w-full text-left card p-4 transition-all group ${
                isUnlocked ? "hover:border-ccb-primary/40 cursor-pointer" : "opacity-50 cursor-not-allowed"
              } ${isComplete ? "border-emerald-500/30" : ""}`}
            >
              <div className="flex items-center gap-3">
                {/* Level number badge */}
                <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${
                  isComplete
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : isUnlocked
                    ? "bg-ccb-primary/15 text-ccb-primary border border-ccb-primary/30"
                    : "bg-ccb-surface text-ccb-muted border border-ccb-border"
                }`}>
                  {isComplete ? (
                    <Check className="w-5 h-5" />
                  ) : isUnlocked ? (
                    level.level
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  {isComplete && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <Star className="w-3 h-3 text-white fill-white" />
                    </span>
                  )}
                </div>

                {/* Level info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">Level {level.level}: {level.name}</h3>
                  </div>
                  <p className="text-xs text-ccb-muted mt-0.5 truncate">{level.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-ccb-surface overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isComplete ? "#34d399" : "var(--ccb-primary)",
                        }}
                      />
                    </div>
                    <span className="text-xs text-ccb-muted shrink-0">
                      {solvedInLevel}/{level.puzzles.length}
                    </span>
                  </div>
                </div>

                {/* Rating range */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ccb-surface text-ccb-muted border border-ccb-border">
                    {level.ratingRange}
                  </span>
                  {isUnlocked && !isComplete && (
                    <Play className="w-3.5 h-3.5 text-ccb-primary/60 group-hover:text-ccb-primary transition-colors" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

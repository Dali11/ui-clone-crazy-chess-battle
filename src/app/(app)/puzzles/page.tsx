"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Check, Flame, Target, Trophy } from "lucide-react";
import { puzzleSets, type PuzzleSet, type ChessPuzzle } from "@/lib/puzzles/puzzle-data";
import { usePuzzleProgress } from "@/lib/puzzles/puzzle-progress";
import PuzzleBoard from "@/components/puzzles/puzzle-board";

type View = "sets" | "playing";

export default function PuzzlesPage() {
  const [view, setView] = useState<View>("sets");
  const [activeSet, setActiveSet] = useState<PuzzleSet | null>(null);
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const { progress, markSolved, markFailed } = usePuzzleProgress();

  const currentPuzzle = activeSet?.puzzles[puzzleIdx];
  const hasNext = activeSet && puzzleIdx < activeSet.puzzles.length - 1;

  const handleNext = () => {
    if (hasNext) {
      setPuzzleIdx(puzzleIdx + 1);
    }
  };

  const startSet = (set: PuzzleSet) => {
    setActiveSet(set);
    setPuzzleIdx(0);
    setView("playing");
  };

  const backToSets = () => {
    setView("sets");
    setActiveSet(null);
    setPuzzleIdx(0);
  };

  // Stats
  const totalSolved = progress.solved.length;
  const totalPuzzles = puzzleSets.reduce((sum, s) => sum + s.puzzles.length, 0);
  const completionPct = totalPuzzles > 0 ? Math.round((totalSolved / totalPuzzles) * 100) : 0;

  if (view === "playing" && activeSet && currentPuzzle) {
    return (
      <div className="space-y-4 pb-24 sm:pb-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={backToSets}
            className="flex items-center gap-1 text-sm text-ccb-muted hover:text-ccb-text transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-lg">{activeSet.icon}</span>
            <span className="font-bold text-sm">{activeSet.name}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-orange-400">
              <Flame className="w-3.5 h-3.5" />
              <span className="font-bold">{progress.streak}</span>
            </span>
          </div>
        </div>

        {/* Puzzle board */}
        <PuzzleBoard
          puzzle={currentPuzzle}
          onSolved={() => markSolved(currentPuzzle.id)}
          onFailed={() => markFailed(currentPuzzle.id)}
          onNext={handleNext}
          hasNext={!!hasNext}
          puzzleNumber={puzzleIdx + 1}
          totalPuzzles={activeSet.puzzles.length}
        />
      </div>
    );
  }

  // Sets overview
  return (
    <div className="space-y-4 pb-24 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Chess Puzzles</h1>
        <p className="text-sm text-ccb-muted mt-1">Sharpen your tactics and pattern recognition</p>
      </div>

      {/* Overall progress */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-ccb-primary" />
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
          <span>{totalSolved} solved</span>
          <span className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-orange-400" />
            Best streak: {progress.bestStreak}
          </span>
        </div>
      </div>

      {/* Puzzle sets */}
      <div className="space-y-3">
        {puzzleSets.map((set) => {
          const solvedInSet = set.puzzles.filter((p) => progress.solved.includes(p.id)).length;
          const setPct = Math.round((solvedInSet / set.puzzles.length) * 100);
          const isComplete = solvedInSet === set.puzzles.length;

          return (
            <button
              key={set.id}
              onClick={() => startSet(set)}
              className="w-full text-left card p-4 hover:border-ccb-primary/40 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ backgroundColor: `${set.color}15`, border: `1px solid ${set.color}30` }}
                >
                  {set.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{set.name}</h3>
                    {isComplete && <Check className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <p className="text-xs text-ccb-muted mt-0.5 truncate">{set.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-ccb-surface overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${setPct}%`, backgroundColor: set.color }}
                      />
                    </div>
                    <span className="text-xs text-ccb-muted shrink-0">
                      {solvedInSet}/{set.puzzles.length}
                    </span>
                  </div>
                </div>
                <div
                  className="text-xs font-medium px-2 py-1 rounded-full shrink-0"
                  style={{ backgroundColor: `${set.color}10`, color: set.color }}
                >
                  {set.difficulty}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

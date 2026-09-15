"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap, Lock, CheckCircle2, Clock, ChevronRight } from "lucide-react";

interface LessonCard {
  id: string;
  title: string;
  minutes: number;
  summary: string;
}

interface TrackCard {
  id: string;
  title: string;
  subtitle: string;
  lessons: LessonCard[];
}

export default function AcademyClient({
  member,
  completed,
  total,
  tracks,
}: {
  member: boolean;
  completed: string[];
  total: number;
  tracks: TrackCard[];
}) {
  const [done] = useState<Set<string>>(new Set(completed));
  const pct = total ? Math.round((completed.length / total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-ccb-primary/30 bg-ccb-primary/10 px-4 py-1.5 mb-4">
          <GraduationCap className="w-4 h-4 text-ccb-primary" />
          <span className="text-xs sm:text-sm text-ccb-primary font-semibold">Member benefit</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold mb-2">Chess Academy</h1>
        <p className="text-sm text-ccb-muted max-w-md mx-auto">
          A full training curriculum — foundations, tactics and winning technique. Built for
          battle play: every lesson ends with how the idea works under the clock.
        </p>
      </div>

      {member && (
        <div className="rounded-2xl border border-ccb-border bg-card p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Your progress</p>
            <p className="text-sm font-semibold text-ccb-primary">
              {completed.length}/{total} lessons
            </p>
          </div>
          <div className="h-2 rounded-full bg-ccb-border overflow-hidden">
            <div
              className="h-full rounded-full bg-ccb-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {completed.length > 0 && (
            <p className="text-xs text-ccb-muted mt-2">
              {pct}% of the Academy complete. Finish a track to sharpen exactly what battles reward.
            </p>
          )}
        </div>
      )}

      {!member && (
        <div className="rounded-2xl border border-ccb-primary/30 bg-ccb-primary/5 p-5 mb-6 text-center">
          <Lock className="w-6 h-6 text-ccb-primary mx-auto mb-2" />
          <p className="text-sm font-semibold mb-1">The Academy is a Club Membership benefit</p>
          <p className="text-xs text-ccb-muted mb-4">
            $10/month gets you the full curriculum, your progress tracking, zero ads and 1.5x
            league XP.
          </p>
          <Link
            href="/membership"
            className="inline-flex items-center gap-2 rounded-lg bg-ccb-primary text-ccb-primary-foreground px-4 py-2 text-sm font-semibold"
          >
            Join the club
          </Link>
        </div>
      )}

      {/* Tracks */}
      <div className="space-y-8">
        {tracks.map((track, ti) => {
          const trackDone = track.lessons.filter((l) => done.has(l.id)).length;
          return (
            <section key={track.id}>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-bold">
                    <span className="text-ccb-muted font-normal text-sm mr-1.5">
                      Track {ti + 1}
                    </span>
                    {track.title}
                  </h2>
                  <p className="text-xs text-ccb-muted mt-0.5">{track.subtitle}</p>
                </div>
                <span className="text-xs text-ccb-muted shrink-0">
                  {trackDone}/{track.lessons.length}
                </span>
              </div>

              <div className="space-y-2">
                {track.lessons.map((lesson) => {
                  const isDone = done.has(lesson.id);
                  return (
                    <Link
                      key={lesson.id}
                      href={`/academy/${lesson.id}`}
                      className="flex items-center gap-3 rounded-xl border border-ccb-border bg-card p-4 hover:border-ccb-primary/50 transition-colors"
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isDone
                            ? "bg-ccb-success/15 text-ccb-success"
                            : member
                              ? "bg-ccb-primary/10 text-ccb-primary"
                              : "bg-ccb-border/50 text-ccb-muted"
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : member ? (
                          <GraduationCap className="w-4 h-4" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{lesson.title}</p>
                        <p className="text-xs text-ccb-muted truncate">{lesson.summary}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs text-ccb-muted">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{lesson.minutes} min</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

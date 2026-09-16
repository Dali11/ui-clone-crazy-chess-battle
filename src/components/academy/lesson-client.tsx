"use client";

import { useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { Lesson } from "@/lib/academy/curriculum";
import { customPieces } from "@/lib/game/piece-styles";

export default function LessonClient({
  lesson,
  trackTitle,
  nextLesson,
  isCompleted,
}: {
  lesson: Lesson;
  trackTitle: string;
  nextLesson: { id: string; title: string } | null;
  isCompleted: boolean;
}) {
  const [completed, setCompleted] = useState(isCompleted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markComplete = async () => {
    if (saving || completed) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/academy/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lesson.id }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(data.error || "Could not save progress — try again");
        return;
      }
      setCompleted(true);
    } catch {
      setError("Could not save progress — try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="max-w-2xl lg:max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <Link
        href="/academy"
        className="inline-flex items-center gap-1.5 text-xs text-ccb-muted hover:text-ccb-foreground mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Academy · {trackTitle}
      </Link>

      <h1 className="text-xl sm:text-2xl font-bold mb-2">{lesson.title}</h1>
      <div className="flex items-center gap-3 text-xs text-ccb-muted mb-6">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> {lesson.minutes} min read
        </span>
        {completed && (
          <span className="inline-flex items-center gap-1 text-ccb-success font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        )}
      </div>

      {/* Body */}
      <div className="space-y-8">
        {lesson.sections.map((sec, i) => (
          <section key={i}>
            <h2 className="font-bold text-base mb-3">{sec.heading}</h2>
            <div className="space-y-3">
              {sec.paragraphs.map((p, j) => (
                <p key={j} className="text-sm leading-relaxed text-ccb-foreground/90">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}

        {/* Diagrams render at the end of the lesson, full width */}
        {lesson.diagrams && lesson.diagrams.length > 0 && (
          <section className="space-y-6">
            {lesson.diagrams.map((d, i) => (
              <figure key={i} className="rounded-2xl border border-ccb-border bg-card p-4">
                <div className="flex justify-center">
                  <div className="w-full max-w-[320px]">
                    <Chessboard
                      options={{
                        id: `academy-diagram-${lesson.id}-${i}`,
                        position: d.fen,
                        pieces: customPieces,
                        allowDragging: false,
                        allowDrawingArrows: false,
                        boardStyle: { width: "100%", height: "auto", aspectRatio: "1 / 1" },
                      }}
                    />
                  </div>
                </div>
                <figcaption className="text-xs text-ccb-muted text-center mt-3 leading-relaxed">
                  {d.caption}
                </figcaption>
              </figure>
            ))}
          </section>
        )}

        {/* Key takeaways */}
        <section className="rounded-2xl border border-ccb-primary/30 bg-ccb-primary/5 p-5">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-ccb-primary" /> Key takeaways
          </p>
          <ul className="space-y-2">
            {lesson.takeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-ccb-primary shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-ccb-border">
        <Link href="/academy" className="text-sm text-ccb-muted hover:text-ccb-foreground">
          Back to Academy
        </Link>
        <div className="flex items-center gap-2">
          {completed ? (
            nextLesson ? (
              <Link
                href={`/academy/${nextLesson.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-ccb-primary text-ccb-primary-foreground px-4 py-2 text-sm font-semibold"
              >
                Next: {nextLesson.title} <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2 text-sm text-ccb-success font-semibold">
                <CheckCircle2 className="w-4 h-4" /> Track complete
              </span>
            )
          ) : (
            <>
              {nextLesson && (
                <Link
                  href={`/academy/${nextLesson.id}`}
                  className="text-sm text-ccb-muted hover:text-ccb-foreground"
                >
                  Skip
                </Link>
              )}
              <span className="text-right">
                {error && (
                  <span className="block text-xs text-red-500 mb-1.5">{error}</span>
                )}
                <button
                  onClick={markComplete}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-ccb-primary text-ccb-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Mark complete
                </button>
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

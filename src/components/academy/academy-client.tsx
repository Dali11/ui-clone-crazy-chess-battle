"use client";

import Link from "next/link";
import { GraduationCap, Lock, Sparkles } from "lucide-react";

/**
 * Chess Academy — coming-soon teaser. The hero keeps selling membership;
 * the curriculum (3 tracks, 15 lessons) is hidden until launch.
 */
export default function AcademyClient({ member }: { member: boolean }) {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header — unchanged */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-ccb-primary/30 bg-ccb-primary/10 px-4 py-1.5 mb-4">
          <GraduationCap className="w-4 h-4 text-ccb-primary" />
          <span className="text-xs sm:text-sm text-ccb-primary font-semibold">
            Member benefit
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold mb-2">Chess Academy</h1>
        <p className="text-sm text-ccb-muted max-w-md mx-auto">
          A full training curriculum — foundations, tactics and winning technique. Built for
          battle play: every lesson ends with how the idea works under the clock.
        </p>
      </div>

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

      {/* Coming soon */}
      <div className="rounded-2xl border border-ccb-border bg-card p-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-ccb-primary/30 bg-ccb-primary/10 px-4 py-1.5 mb-4">
          <Sparkles className="w-4 h-4 text-ccb-primary" />
          <span className="text-xs text-ccb-primary font-semibold">Coming soon</span>
        </div>
        <p className="text-base font-bold mb-2">The curriculum is on its way</p>
        <p className="text-sm text-ccb-muted max-w-md mx-auto leading-relaxed">
          {member
            ? "As a club member you get first access the moment it drops — your progress tracking is ready and waiting. Watch this space."
            : "3 tracks · 15 lessons, from your first opening to how to convert a won position under the clock. Join the club now so you're first in line when it launches."}
        </p>
      </div>
    </div>
  );
}

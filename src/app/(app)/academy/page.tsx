import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMember } from "@/lib/membership/membership";
import { TRACKS, TOTAL_LESSONS } from "@/lib/academy/curriculum";
import AcademyClient from "@/components/academy/academy-client";

export const metadata: Metadata = {
  title: "Chess Academy — Crazy Chess Battles",
};

export default async function AcademyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let member = false;
  let completed: string[] = [];

  if (user) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("membership_until")
      .eq("id", user.id)
      .single();
    member = isMember(profile?.membership_until, new Date().toISOString());

    // Progress history is the player's own — visible even if membership lapsed.
    const { data } = await supabase
      .from("academy_progress")
      .select("lesson_id")
      .eq("user_id", user.id);
    completed = (data || []).map((r: any) => r.lesson_id);
  }

  return (
    <AcademyClient
      member={member}
      completed={completed}
      total={TOTAL_LESSONS}
      tracks={TRACKS.map((t) => ({
        id: t.id,
        title: t.title,
        subtitle: t.subtitle,
        lessons: t.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          minutes: l.minutes,
          summary: l.summary,
        })),
      }))}
    />
  );
}

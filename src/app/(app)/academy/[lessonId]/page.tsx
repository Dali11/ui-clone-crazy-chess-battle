import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMember } from "@/lib/membership/membership";
import { getLesson, getTrackOf } from "@/lib/academy/curriculum";
import LessonClient from "@/components/academy/lesson-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}): Promise<Metadata> {
  const { lessonId } = await params;
  const lesson = getLesson(lessonId);
  return { title: lesson ? `${lesson.title} — Academy` : "Chess Academy — Crazy Chess Battles" };
}

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = getLesson(lessonId);
  if (!lesson) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let member = false;
  let isCompleted = false;

  if (user) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("membership_until")
      .eq("id", user.id)
      .single();
    member = isMember(profile?.membership_until, new Date().toISOString());

    const { data } = await supabase
      .from("academy_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .maybeSingle();
    isCompleted = !!data;
  }

  // Lesson content is a member benefit. Non-members see the Academy home
  // (locked view with the membership CTA) instead of the lesson body.
  if (!member) redirect("/academy");

  const track = getTrackOf(lessonId)!;

  // Flat lesson order for "next lesson" navigation.
  const all = track.lessons;
  const idx = all.findIndex((l) => l.id === lessonId);
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  return (
    <LessonClient
      lesson={lesson}
      trackTitle={track.title}
      nextLesson={next ? { id: next.id, title: next.title } : null}
      isCompleted={isCompleted}
    />
  );
}

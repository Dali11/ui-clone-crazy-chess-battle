import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMember } from "@/lib/membership/membership";
import { getLesson, TOTAL_LESSONS } from "@/lib/academy/curriculum";

export const dynamic = "force-dynamic";

/**
 * GET  /api/academy/progress — the current player's completed lesson ids.
 * POST /api/academy/progress — mark a lesson complete (members only).
 *
 * Reading your own progress is always allowed (your study history is
 * yours, even after a membership lapses). Marking new completions
 * requires an active membership — the Academy is a member benefit.
 */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data } = await supabase
      .from("academy_progress")
      .select("lesson_id, completed_at")
      .eq("user_id", user.id);

    return NextResponse.json({
      completed: (data || []).map((r: any) => r.lesson_id),
      total: TOTAL_LESSONS,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lessonId = String(body.lesson_id || "");
    if (!getLesson(lessonId)) return NextResponse.json({ error: "Unknown lesson" }, { status: 400 });

    // Membership gate — marking lessons complete is a member benefit.
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("membership_until")
      .eq("id", user.id)
      .single();
    const now = new Date().toISOString();
    if (!isMember(profile?.membership_until, now)) {
      return NextResponse.json(
        { error: "Chess Academy is a member benefit — join the club to track your progress." },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("academy_progress")
      .upsert({ user_id: user.id, lesson_id: lessonId, completed_at: now });

    if (error) return NextResponse.json({ error: "Could not save progress" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

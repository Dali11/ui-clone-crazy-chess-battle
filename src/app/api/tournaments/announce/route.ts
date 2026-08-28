import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  // Simple auth check via header
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const tournamentId = body.tournamentId || "8f260ce0-6092-4dd6-8ad4-b422f3d215c0";
  const tournamentName = body.tournamentName || "Friday Night Battle";
  const startTime = body.startTime || "Tonight, 8:30 PM CAT";

  const admin = createAdminClient();

  // Fetch all user emails
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("email, full_name, username")
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
  }

  const emails = (profiles || []).filter((p: any) => p.email);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const profile of emails) {
    try {
      await sendEmail({
        to: profile.email,
        subject: `♟️ Friday Night Battle starts tonight at 8:30 PM — join now!`,
        template: "new_tournament",
        data: {
          tournamentName,
          tournamentId,
          startTime,
          entryFee: 500,
          username: profile.username || profile.full_name || "Player",
        },
      });
      sent++;
    } catch (e: any) {
      failed++;
      if (errors.length < 5) errors.push(`${profile.email}: ${e.message}`);
    }
  }

  return NextResponse.json({
    total: emails.length,
    sent,
    failed,
    errors: errors.length ? errors : undefined,
  });
}

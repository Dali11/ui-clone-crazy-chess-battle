import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBatchEmails } from "@/lib/email";

/**
 * POST /api/tournaments/send-starting-email
 * Body: { tournamentId: string }
 * 
 * Sends "tournament_starting_soon" email to all registered participants
 * of the given tournament.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tournamentId = body.tournamentId;

    if (!tournamentId) {
      return NextResponse.json({ error: "tournamentId required" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: tournament, error: tError } = await admin
      .from("tournaments")
      .select("id, name, starts_at, type, entry_fee")
      .eq("id", tournamentId)
      .single();

    if (tError || !tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const { data: participants, error: pError } = await admin
      .from("tournament_participants")
      .select("player_id")
      .eq("tournament_id", tournamentId);

    if (pError || !participants || participants.length === 0) {
      return NextResponse.json({ error: "No participants found" }, { status: 404 });
    }

    const playerIds = participants.map((p) => p.player_id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, display_name, username")
      .in("id", playerIds);

    const emailList = (profiles || [])
      .filter((p: any) => p.email)
      .map((p: any) => ({
        to: p.email,
        subject: `⏰ ${tournament.name} starts soon — get ready!`,
        template: "tournament_starting_soon" as const,
        data: {
          tournamentName: tournament.name,
          tournamentId: tournament.id,
          startsAt: tournament.starts_at,
          startTime: tournament.starts_at ? new Date(tournament.starts_at).toLocaleString("en-GB", {
            timeZone: "Africa/Blantyre",
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }) + " CAT" : "TBD",
        },
      }));

    if (emailList.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: "No participants with emails" });
    }

    await sendBatchEmails(emailList);

    return NextResponse.json({
      success: true,
      tournament: tournament.name,
      participants: participants.length,
      emailsSent: emailList.length,
    });
  } catch (e: any) {
    console.error("[send-starting-email] Error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

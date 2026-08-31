import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, type, data } = await req.json();
    if (!userId || !type) {
      return NextResponse.json({ error: "Missing userId or type" }, { status: 400 });
    }

    const admin = createAdminClient();
    
    const { data: profile } = await admin
      .from("profiles")
      .select("id, username, email")
      .eq("id", userId)
      .single();

    if (!profile?.email) {
      return NextResponse.json({ error: "No email found" }, { status: 404 });
    }

    let subject = "";
    let body = "";
    
    switch (type) {
      case "tournament_starting":
        subject = `Tournament starting soon: ${data.tournamentName}`;
        body = `Your tournament "${data.tournamentName}" starts at ${data.startTime}. Get ready!`;
        break;
      case "tournament_started":
        subject = `${data.tournamentName} has started!`;
        body = `Your tournament "${data.tournamentName}" is now active. Your first game is waiting.`;
        break;
      case "withdrawal_approved":
        subject = "Your withdrawal has been approved";
        body = `${data.amount} has been sent to ${data.phone} via ${data.operator}.`;
        break;
      case "withdrawal_rejected":
        subject = "Your withdrawal request was rejected";
        body = `Your withdrawal for ${data.amount} was rejected. Funds returned to wallet. Reason: ${data.reason || "Not specified"}`;
        break;
      case "challenge_received":
        subject = `${data.challengerName} challenged you to a game!`;
        body = `${data.challengerName} (${data.challengerRating}) challenged you to a ${data.timeControl} game.`;
        break;
      default:
        return NextResponse.json({ error: "Unknown notification type" }, { status: 400 });
    }

    // Store as in-app notification
    const { error } = await admin.from("notifications").insert({
      user_id: userId,
      type,
      title: subject,
      body,
      data: data || {},
      read: false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sent: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}

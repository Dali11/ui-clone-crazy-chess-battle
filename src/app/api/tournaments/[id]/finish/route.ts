import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = resolvedParams.id;
    const admin = createAdminClient();

    // Fetch tournament to check authorization
    const { data: tournament } = await admin
      .from("tournaments")
      .select("created_by")
      .eq("id", tournamentId)
      .single();

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Check authorization: admin OR tournament creator
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.is_admin ?? false;
    const isCreator = tournament.created_by === user.id;

    if (!isAdmin && !isCreator) {
      return NextResponse.json(
        { error: "Only the tournament creator or an admin can finish the tournament" },
        { status: 403 }
      );
    }

    // Delegate to shared finish logic (ranking + prize distribution + emails)
    const { finishTournament } = await import("@/lib/tournament/finish");
    await finishTournament(tournamentId);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to finish tournament" }, { status: 500 });
  }
}

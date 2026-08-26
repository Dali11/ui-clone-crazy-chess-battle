import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = resolvedParams.id;

    // Verify tournament exists and is upcoming
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", tournamentId)
      .single();

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (tournament.status !== "upcoming") {
      return NextResponse.json(
        { error: "Cannot leave active or finished tournament" },
        { status: 400 }
      );
    }

    // Remove participant — entry fee is NOT refunded on voluntary withdrawal.
    // Refunds only happen when admin cancels the tournament.
    const admin = createAdminClient();
    const { error } = await admin
      .from("tournament_participants")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("player_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to leave tournament" },
      { status: 500 }
    );
  }
}

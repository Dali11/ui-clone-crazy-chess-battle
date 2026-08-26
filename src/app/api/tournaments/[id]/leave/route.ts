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
      .select("status, entry_fee_cents, prize_pool_cents, pool_source")
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

    // Check if player paid entry fee — refund if so
    const admin = createAdminClient();
    const { data: participant } = await admin
      .from("tournament_participants")
      .select("paid_entry_fee")
      .eq("tournament_id", tournamentId)
      .eq("player_id", user.id)
      .single();

    if (participant?.paid_entry_fee && tournament.entry_fee_cents) {
      // Refund entry fee
      await admin.rpc("credit_wallet", {
        p_user_id: user.id,
        p_amount_cents: tournament.entry_fee_cents,
      });

      // Deduct from prize pool ONLY if pool_source is 'entry_fees' (not 'fixed')
      if (tournament.pool_source !== 'fixed') {
        await admin
          .from("tournaments")
          .update({
            prize_pool_cents: Math.max(0, (tournament.prize_pool_cents || 0) - tournament.entry_fee_cents),
          })
          .eq("id", tournamentId);
      }
    }

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

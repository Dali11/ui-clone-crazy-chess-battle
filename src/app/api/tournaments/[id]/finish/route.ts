import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { distributePrizes } from "@/lib/tournament/prizes";

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

    // Fetch tournament details
    const { data: tournament } = await admin
      .from("tournaments")
      .select(`
        id,
        prize_pool_cents,
        prize_distribution,
        entry_fee_cents,
        creator_profit_percent,
        created_by,
        name
      `)
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

    // Mark tournament as finished
    const { error } = await admin
      .from("tournaments")
      .update({ status: "finished", ended_at: new Date().toISOString() })
      .eq("id", tournamentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Rank participants using proper Swiss tiebreaks (Buchholz, Sonneborn-Berger)
    const { calculateTiebreaks } = await import("@/lib/tournament/tiebreaks");
    const rankedParticipants = await calculateTiebreaks(admin, tournamentId);

    if (rankedParticipants && rankedParticipants.length > 0) {

      for (const p of rankedParticipants) {
        await admin
          .from("tournament_participants")
          .update({ final_rank: p.final_rank })
          .eq("player_id", p.player_id)
          .eq("tournament_id", tournamentId);
      }

      // Calculate prize distribution
      const totalCollected = tournament.prize_pool_cents || 0;
      const creatorProfitPercent = tournament.creator_profit_percent || 0;

      if (totalCollected > 0) {
        if (creatorProfitPercent > 0) {
          // User-created paid tournament: 10% platform cut, creator profit, rest is prize pool
          const PLATFORM_CUT_PERCENT = 10;
          const platformCut = Math.floor(totalCollected * (PLATFORM_CUT_PERCENT / 100));
          const remainder = totalCollected - platformCut;
          const creatorProfit = Math.floor(remainder * (creatorProfitPercent / 100));
          const actualPrizePool = remainder - creatorProfit;

          // Distribute actual prize pool to winners
          if (actualPrizePool > 0) {
            await distributePrizes(
              tournamentId,
              rankedParticipants.map((p) => ({
                player_id: p.player_id,
                final_rank: p.final_rank,
                score: p.score ?? 0,
              })),
              actualPrizePool,
              tournament.prize_distribution || { type: "flat", payouts: [] }
            );
          }

          // Credit creator profit to creator's wallet
          if (creatorProfit > 0 && tournament.created_by) {
            await admin.rpc("credit_wallet", {
              p_user_id: tournament.created_by,
              p_amount_cents: creatorProfit,
            });

            // Record creator profit payout for audit trail
            await admin.from("deposits").insert({
              user_id: tournament.created_by,
              amount_cents: creatorProfit,
              status: "success",
              method: "tournament_creator_profit",
              reference: `tournament:${tournamentId}:creator_profit`,
            });
          }

          // Record platform cut (just audit — platform keeps it)
          if (platformCut > 0) {
            await admin.from("deposits").insert({
              user_id: tournament.created_by, // associate with the tournament for audit
              amount_cents: -platformCut,
              status: "success",
              method: "platform_cut",
              reference: `tournament:${tournamentId}:platform_cut`,
            });
          }

          // Update tournament with the economics breakdown
          await admin
            .from("tournaments")
            .update({
              prize_distribution: {
                ...(tournament.prize_distribution || {}),
                economics: {
                  totalCollected,
                  platformCut,
                  platformCutPercent: PLATFORM_CUT_PERCENT,
                  creatorProfit,
                  creatorProfitPercent,
                  actualPrizePool,
                  created_by: tournament.created_by,
                },
              },
            })
            .eq("id", tournamentId);
        } else {
          // Admin/legacy tournament or free tournament: distribute full prize pool
          await distributePrizes(
            tournamentId,
            rankedParticipants.map((p) => ({
              player_id: p.player_id,
              final_rank: p.final_rank,
              score: p.score ?? 0,
            })),
            totalCollected,
            tournament.prize_distribution || { type: "flat", payouts: [] }
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to finish tournament" }, { status: 500 });
  }
}

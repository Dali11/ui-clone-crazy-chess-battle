export default async function handler(req: any, res: any) {
  try {
    // Use the service role key from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Get all finished tournaments with prize pools
    const { data: finishedTournaments } = await admin
      .from("tournaments")
      .select("id, name, status, prize_pool_cents, prize_distribution, pool_source, ended_at, type")
      .in("status", ["finished", "completed"])
      .order("created_at", { ascending: false });

    // 2. Get all deposits with type 'tournament_payout'
    const { data: payouts } = await admin
      .from("deposits")
      .select("id, user_id, amount_cents, reference, status, created_at, metadata")
      .ilike("reference", "tournament:%")
      .order("created_at", { ascending: false });

    // 3. For each finished tournament, check participants
    const results: any[] = [];
    for (const t of finishedTournaments || []) {
      const { data: participants } = await admin
        .from("tournament_participants")
        .select("player_id, rank, final_score, paid_entry_fee")
        .eq("tournament_id", t.id)
        .order("rank", { ascending: true });

      const tournamentPayouts = (payouts || []).filter(
        (p: any) => p.reference && p.reference.startsWith(`tournament:${t.id}:`)
      );

      results.push({
        tournament: {
          id: t.id,
          name: t.name,
          status: t.status,
          type: t.type,
          prize_pool_cents: t.prize_pool_cents,
          prize_pool_display: `MK ${(t.prize_pool_cents / 100).toLocaleString()}`,
          pool_source: t.pool_source,
          prize_distribution: t.prize_distribution,
          ended_at: t.ended_at,
          participant_count: participants?.length || 0,
        },
        payouts: tournamentPayouts.map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          amount_cents: p.amount_cents,
          amount_display: `MK ${(p.amount_cents / 100).toLocaleString()}`,
          reference: p.reference,
          status: p.status,
          created_at: p.created_at,
        })),
        payout_count: tournamentPayouts.length,
        participants: participants?.map((p: any) => ({
          player_id: p.player_id,
          rank: p.rank,
          final_score: p.final_score,
          paid_entry_fee: p.paid_entry_fee,
        })) || [],
      });
    }

    return res.status(200).json({
      total_finished_tournaments: finishedTournaments?.length || 0,
      total_payouts: payouts?.length || 0,
      results,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}

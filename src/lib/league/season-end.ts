import { createAdminClient } from "@/lib/supabase/admin";
import { recalcStandings } from "@/lib/league/engine";

export interface SeasonEndResult {
  leagueId: string;
  champion: string | null;
  runnerUp: string | null;
  promotions: { playerId: string; fromTier: number; toTier: number }[];
  relegations: { playerId: string; fromTier: number; toTier: number }[];
  payouts: { playerId: string; position: number; amount: number }[];
  archived: boolean;
  newLeagueId: string | null;
}

export async function finalizeLeagueSeason(leagueId: string): Promise<SeasonEndResult> {
  const supabase = createAdminClient();

  // 1. Fetch league details
  const { data: league, error: leagueErr } = await supabase
    .from("premier_leagues")
    .select("*")
    .eq("id", leagueId)
    .single();

  if (leagueErr || !league) {
    console.error("[season-end] League not found:", leagueId, leagueErr?.message);
    return {
      leagueId,
      champion: null,
      runnerUp: null,
      promotions: [],
      relegations: [],
      payouts: [],
      archived: false,
      newLeagueId: null,
    };
  }

  // 2. Recalculate standings to ensure accuracy
  const standings = await recalcStandings(supabase as any, leagueId);

  const champion = standings.length > 0 ? standings[0].player_id : null;
  const runnerUp = standings.length > 1 ? standings[1].player_id : null;

  const promotions: { playerId: string; fromTier: number; toTier: number }[] = [];
  const relegations: { playerId: string; fromTier: number; toTier: number }[] = [];
  const payouts: { playerId: string; position: number; amount: number }[] = [];

  let updatedPlayerIds = [...(league.player_ids || [])];

  // ============================================================
  // Step 1: Promotion & Relegation
  // ============================================================
  const promotesCount = league.promotes_count || 0;
  const relegatesCount = league.relegates_count || 0;

  // Promotion
  if (promotesCount > 0 && standings.length > 0) {
    const targetTier = league.tier - 1;
    let query = supabase.from("premier_leagues").select("id, player_ids").eq("tier", targetTier);
    if (league.gender_restriction) {
      query = query.eq("gender_restriction", league.gender_restriction);
    }
    const { data: targetLeagues } = await query;
    const targetLeague = targetLeagues && targetLeagues.length > 0 ? targetLeagues[0] : null;

    if (targetLeague) {
      const toPromote = standings.slice(0, Math.min(promotesCount, standings.length));
      const promotedIds = toPromote.map((s: any) => s.player_id);

      // Remove promoted players from current league's player list
      updatedPlayerIds = updatedPlayerIds.filter((id) => !promotedIds.includes(id));

      // Add to target league
      const targetPlayerIds = Array.from(
        new Set([...(targetLeague.player_ids || []), ...promotedIds])
      );

      await supabase
        .from("premier_leagues")
        .update({ player_ids: targetPlayerIds, updated_at: new Date().toISOString() })
        .eq("id", targetLeague.id);

      for (const pid of promotedIds) {
        promotions.push({ playerId: pid, fromTier: league.tier, toTier: targetTier });
      }
    } else {
      console.log(`[season-end] No target league found at tier ${targetTier} for promotion from league ${leagueId}`);
    }
  }

  // Relegation
  if (relegatesCount > 0 && standings.length > 0) {
    const targetTier = league.tier + 1;
    let query = supabase.from("premier_leagues").select("id, player_ids").eq("tier", targetTier);
    if (league.gender_restriction) {
      query = query.eq("gender_restriction", league.gender_restriction);
    }
    const { data: targetLeagues } = await query;
    const targetLeague = targetLeagues && targetLeagues.length > 0 ? targetLeagues[0] : null;

    if (targetLeague) {
      const availableForRelegation = standings.filter((s: any) => updatedPlayerIds.includes(s.player_id));
      const toRelegate = availableForRelegation.slice(Math.max(0, availableForRelegation.length - relegatesCount));
      const relegatedIds = toRelegate.map((s: any) => s.player_id);

      // Remove relegated players from current league's player list
      updatedPlayerIds = updatedPlayerIds.filter((id) => !relegatedIds.includes(id));

      // Add to target league
      const targetPlayerIds = Array.from(
        new Set([...(targetLeague.player_ids || []), ...relegatedIds])
      );

      await supabase
        .from("premier_leagues")
        .update({ player_ids: targetPlayerIds, updated_at: new Date().toISOString() })
        .eq("id", targetLeague.id);

      for (const pid of relegatedIds) {
        relegations.push({ playerId: pid, fromTier: league.tier, toTier: targetTier });
      }
    } else {
      console.log(`[season-end] No target league found at tier ${targetTier} for relegation from league ${leagueId}`);
    }
  }

  // Update current league's player_ids
  await supabase
    .from("premier_leagues")
    .update({ player_ids: updatedPlayerIds, updated_at: new Date().toISOString() })
    .eq("id", leagueId);

  // ============================================================
  // Step 2: Prize Payout
  // ============================================================
  if (league.prize_pool && league.prize_pool > 0 && league.payout_config) {
    let config: Record<string, number> | null = null;
    if (typeof league.payout_config === "string") {
      try {
        config = JSON.parse(league.payout_config);
      } catch {
        config = null;
      }
    } else if (typeof league.payout_config === "object" && league.payout_config !== null) {
      config = league.payout_config as Record<string, number>;
    }

    if (config) {
      for (const [posStr, rawVal] of Object.entries(config)) {
        const pos = parseInt(posStr, 10);
        if (isNaN(pos) || pos < 1) continue;

        let fraction = Number(rawVal);
        if (isNaN(fraction) || fraction <= 0) continue;
        if (fraction > 1) {
          fraction = fraction / 100;
        }

        const standing = standings.find((s: any) => s.position === pos);
        if (!standing) continue;

        const amount = Math.round(league.prize_pool * fraction);
        if (amount <= 0) continue;

        // Credit winner's wallet balance in profiles (in cents)
        const { data: profile } = await supabase
          .from("profiles")
          .select("wallet_balance")
          .eq("id", standing.player_id)
          .single();

        const currentBal = profile?.wallet_balance ?? 0;
        await supabase
          .from("profiles")
          .update({ wallet_balance: currentBal + amount })
          .eq("id", standing.player_id);

        // Record payout in league_payouts table
        await supabase.from("league_payouts").insert({
          league_id: leagueId,
          player_id: standing.player_id,
          position: pos,
          amount: amount,
          created_at: new Date().toISOString(),
        });

        payouts.push({
          playerId: standing.player_id,
          position: pos,
          amount: amount,
        });
      }
    }
  }

  // ============================================================
  // Step 3: Season Archive
  // ============================================================
  let archived = false;
  try {
    const { error: archiveErr } = await supabase.from("league_season_archives").insert({
      league_id: leagueId,
      season_id: league.season_id || null,
      completed_at: new Date().toISOString(),
      final_standings: standings,
      champion_player_id: champion,
      runner_up_player_id: runnerUp,
    });

    if (archiveErr) {
      console.error("[season-end] Failed to insert archive record:", archiveErr.message);
    } else {
      archived = true;
    }
  } catch (err: any) {
    console.error("[season-end] Exception during archive insert:", err?.message || err);
  }

  // ============================================================
  // Step 4: New Season Creation
  // ============================================================
  let newLeagueId: string | null = null;
  if (league.auto_renew) {
    try {
      const { data: newLeague, error: newLeagueErr } = await supabase
        .from("premier_leagues")
        .insert({
          name: league.name,
          country: league.country,
          league_size: league.league_size,
          tier: league.tier,
          gender_restriction: league.gender_restriction,
          entry_type: league.entry_type,
          promotes_count: league.promotes_count,
          relegates_count: league.relegates_count,
          qualifying_positions: league.qualifying_positions,
          prize_pool: league.prize_pool,
          prize_currency: league.prize_currency,
          season_duration_weeks: league.season_duration_weeks,
          payout_config: league.payout_config,
          current_matchday: 1,
          total_matchdays: league.total_matchdays,
          sponsor_name: league.sponsor_name,
          sponsor_logo_url: league.sponsor_logo_url,
          description: league.description,
          banner_url: league.banner_url,
          min_rating: league.min_rating,
          max_rating: league.max_rating,
          min_games_played: league.min_games_played,
          min_account_age_days: league.min_account_age_days,
          requires_phone_verification: league.requires_phone_verification,
          requires_identity_verification: league.requires_identity_verification,
          requires_chesscom_verification: league.requires_chesscom_verification,
          registration_deadline: league.registration_deadline,
          scoring_config: league.scoring_config,
          season_id: league.season_id,
          auto_renew: league.auto_renew,
          status: "registration",
          player_ids: updatedPlayerIds,
        })
        .select("id")
        .single();

      if (newLeagueErr) {
        console.error("[season-end] Error creating new season league:", newLeagueErr.message);
      } else if (newLeague) {
        newLeagueId = newLeague.id;
      }
    } catch (err: any) {
      console.error("[season-end] Exception creating new season league:", err?.message || err);
    }
  }

  return {
    leagueId,
    champion,
    runnerUp,
    promotions,
    relegations,
    payouts,
    archived,
    newLeagueId,
  };
}

// ============================================================
// Pure Helper Functions (exported for testing)
// ============================================================

export interface LeagueStandingItem {
  player_id: string;
  position: number;
}

export function getPromotedPlayers(
  standings: LeagueStandingItem[],
  promotesCount: number
): string[] {
  if (promotesCount <= 0 || standings.length === 0) return [];
  return standings
    .slice(0, Math.min(promotesCount, standings.length))
    .map((s) => s.player_id);
}

export function getRelegatedPlayers(
  standings: LeagueStandingItem[],
  relegatesCount: number
): string[] {
  if (relegatesCount <= 0 || standings.length === 0) return [];
  return standings
    .slice(Math.max(0, standings.length - relegatesCount))
    .map((s) => s.player_id);
}

export function calculatePayouts(
  prizePool: number,
  payoutConfig: Record<string, number> | null,
  standings: LeagueStandingItem[]
): { playerId: string; position: number; amount: number }[] {
  if (!prizePool || prizePool <= 0 || !payoutConfig || Object.keys(payoutConfig).length === 0 || standings.length === 0) {
    return [];
  }
  const payouts: { playerId: string; position: number; amount: number }[] = [];
  for (const [posStr, rawVal] of Object.entries(payoutConfig)) {
    const pos = parseInt(posStr, 10);
    if (isNaN(pos) || pos < 1) continue;
    let fraction = Number(rawVal);
    if (isNaN(fraction) || fraction <= 0) continue;
    if (fraction > 1) fraction = fraction / 100;
    const standing = standings.find((s) => s.position === pos);
    if (!standing) continue;
    const amount = Math.round(prizePool * fraction);
    if (amount <= 0) continue;
    payouts.push({ playerId: standing.player_id, position: pos, amount });
  }
  return payouts;
}

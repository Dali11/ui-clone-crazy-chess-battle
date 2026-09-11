import { createAdminClient } from "@/lib/supabase/admin";
import { currentWeekStart, getLeagueXpConfig, ENTRY_TIER, BATTLE_XP } from "./index";

/**
 * Idempotent XP award for a finished PvP game. Safe to call from every
 * game-ending path (move / resign / draw / timeout / abandonment) and safe
 * to call twice — the unique (user, game_kind, game_id) constraint makes
 * re-processing a no-op.
 *
 * Never throws: XP problems must not break game settlement.
 */
export async function awardGameXp(opts: {
  /** Pre-fetched game row (avoids a re-read when the caller already has it). */
  game?: {
    white_player_id: string;
    black_player_id: string;
    /** "white" | "black" | null */
    winner: string | null;
    white_rating?: number | null;
    black_rating?: number | null;
  };
  gameId: string;
  gameKind?: "chess" | "draughts";
  admin?: ReturnType<typeof createAdminClient>;
}): Promise<void> {
  const admin = opts.admin ?? createAdminClient();
  const kind = opts.gameKind ?? "chess";
  try {
    const cfg = await getLeagueXpConfig(admin);
    if (!cfg.enabled) return;

    // Fetch the finished game if the caller didn't pass it.
    let g = opts.game;
    if (!g) {
      const { data } = await admin
        .from(kind === "draughts" ? "draughts_games" : "games")
        .select("white_player_id, black_player_id, winner, white_rating, black_rating")
        .eq("id", opts.gameId)
        .single();
      g = data ?? undefined;
    }
    if (!g?.white_player_id || !g?.black_player_id) return;

    // Bot / computer opponents never earn or award XP (anti-farming).
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, rating, email")
      .in("id", [g.white_player_id, g.black_player_id]);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const white = byId.get(g.white_player_id);
    const black = byId.get(g.black_player_id);
    if (!white || !black) return;
    if ((white.email || "").endsWith("@ccb.internal") || (black.email || "").endsWith("@ccb.internal")) return;

    const week = currentWeekStart();
    const whiteWon = g.winner === "white";
    const blackWon = g.winner === "black";
    const draw = !g.winner;
    if (!whiteWon && !blackWon && !draw) return;

    const whiteRating = g.white_rating ?? white.rating ?? 400;
    const blackRating = g.black_rating ?? black.rating ?? 400;

    // Staked battle games (incl. armageddon deciders) earn the flat
    // BATTLE_XP rate instead of the normal PvP ladder rates.
    const { data: battleRow } = await admin
      .from("battles")
      .select("id")
      .or(`game_id.eq.${opts.gameId},armageddon_game_id.eq.${opts.gameId}`)
      .limit(1);
    const isBattle = !!battleRow?.length;

    const amountFor = (won: boolean, lostTo: boolean, oppRating: number, myRating: number) => {
      if (isBattle) return draw ? BATTLE_XP.draw : won ? BATTLE_XP.win : BATTLE_XP.loss;
      let xp = draw ? cfg.xp_draw : won ? cfg.xp_win : cfg.xp_loss;
      if (won && lostTo && oppRating > myRating) xp += cfg.xp_upset_bonus;
      return xp;
    };

    const whiteXp = amountFor(whiteWon, blackWon, blackRating, whiteRating);
    const blackXp = amountFor(blackWon, whiteWon, whiteRating, blackRating);

    // Daily cap per player (anti-farming): count today's events first.
    const todayStart = new Date(new Date().getTime() + 2 * 3600_000).toISOString().slice(0, 10) + "T00:00:00.000Z";
    const { data: todayEvents } = await admin
      .from("league_xp_events")
      .select("user_id, amount")
      .in("user_id", [g.white_player_id, g.black_player_id])
      .gte("created_at", todayStart);
    const spent = new Map<string, number>();
    for (const e of todayEvents ?? []) spent.set(e.user_id, (spent.get(e.user_id) ?? 0) + e.amount);

    // Grants may be negative (owner policy 2026-09-11: a loss costs XP).
    // The daily anti-farming cap only limits EARNING — a loss always
    // deducts so players can never farm their way around it.
    const grants: { userId: string; amount: number; reason: string }[] = [];
    const grantFor = (userId: string, xp: number, reason: string) => {
      if (xp === 0) return;
      if (xp < 0) {
        grants.push({ userId, amount: xp, reason });
        return;
      }
      const room = Math.max(0, cfg.daily_xp_cap - (spent.get(userId) ?? 0));
      const amt = Math.min(xp, room);
      if (amt > 0) grants.push({ userId, amount: amt, reason });
    };
    grantFor(g.white_player_id, whiteXp, draw ? "draw" : whiteWon ? "win" : "loss");
    grantFor(g.black_player_id, blackXp, draw ? "draw" : blackWon ? "win" : "loss");
    if (grants.length === 0) return;

    // Insert events; unique(user, kind, game) makes this idempotent.
    const { data: inserted, error: insertError } = await admin
      .from("league_xp_events")
      .insert(
        grants.map((gr) => ({
          user_id: gr.userId,
          game_kind: kind,
          game_id: opts.gameId,
          amount: gr.amount,
          reason: gr.reason,
          week_start: week,
        }))
      )
      .select("user_id, amount");
    if (insertError || !inserted?.length) return; // conflict => already processed

    // Upsert memberships + add XP.
    const playerRows = [g.white_player_id, g.black_player_id];
    for (const p of playerRows) {
      const grant = inserted.find((e) => e.user_id === p);
      if (!grant) continue;
      const { data: member } = await admin.from("league_xp_members").select("*").eq("user_id", p).maybeSingle();
      // Weekly standings XP is floored at 0 — a loss can drag you down
      // the ladder but never into negative territory.
      if (!member) {
        // Owner policy 2026-09-11: new entrants join the league that's
        // currently SHORT on players (fair-share drift control) instead
        // of always Open — ties break toward the lower league. The
        // weekly fair-share rebalance corrects any remaining drift.
        const { data: tierRows } = await admin.from("league_xp_members").select("tier");
        const tierCounts = new Map<number, number>();
        for (const r of tierRows ?? []) tierCounts.set(r.tier, (tierCounts.get(r.tier) ?? 0) + 1);
        let joinTier: number = ENTRY_TIER;
        let bestCount = tierCounts.get(ENTRY_TIER) ?? 0;
        for (const t of [2, 3, 4, 5]) {
          const c = tierCounts.get(t) ?? 0;
          if (c < bestCount) { bestCount = c; joinTier = t; }
        }
        await admin.from("league_xp_members").insert({
          user_id: p,
          tier: joinTier,
          xp: Math.max(0, grant.amount),
          week_start: week,
        });
      } else if (member.week_start === week) {
        await admin
          .from("league_xp_members")
          .update({ xp: Math.max(0, (member.xp ?? 0) + grant.amount), updated_at: new Date().toISOString() })
          .eq("user_id", p);
      } else {
        // Stale week (user played before this week's cron reset ran) — fresh cycle.
        await admin
          .from("league_xp_members")
          .update({ xp: Math.max(0, grant.amount), week_start: week, updated_at: new Date().toISOString() })
          .eq("user_id", p);
      }
    }
  } catch (err) {
    console.error("awardGameXp failed:", err);
  }
}

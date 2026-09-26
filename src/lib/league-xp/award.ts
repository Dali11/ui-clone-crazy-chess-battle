import { createAdminClient } from "@/lib/supabase/admin";
import {
  currentCycleStart,
  getLeagueXpConfig,
  levelFor,
  xpFor,
  type XpGameType,
  type XpResult,
} from "./index";

/**
 * Idempotent XP award for a finished PvP game, using the owner's
 * monthly allocation table (2026-09-26). Safe to call from every
 * game-ending path (move / resign / draw / timeout) and safe to call
 * twice — the unique (user, game_kind, game_id) constraint makes
 * re-processing a no-op. Abandoned/cancelled games never reach here,
 * so they never award XP.
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
      .select("id, rating, email, membership_until")
      .in("id", [g.white_player_id, g.black_player_id]);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const white = byId.get(g.white_player_id);
    const black = byId.get(g.black_player_id);
    if (!white || !black) return;
    if ((white.email || "").endsWith("@ccb.internal") || (black.email || "").endsWith("@ccb.internal")) return;

    const cycle = currentCycleStart();
    const whiteWon = g.winner === "white";
    const blackWon = g.winner === "black";
    const draw = !g.winner;
    if (!whiteWon && !blackWon && !draw) return;

    // Cash game = staked battle (incl. its Armageddon decider).
    // Everything else is a free game.
    const { data: battleRow } = await admin
      .from("battles")
      .select("id")
      .or(`game_id.eq.${opts.gameId},armageddon_game_id.eq.${opts.gameId}`)
      .limit(1);
    const gameType: XpGameType = battleRow?.length ? "cash" : "free";

    // Player level (owner spec 2026-09-26): Club Member = active paid
    // membership. The allocation table carries the whole rate — no
    // upset bonuses, no boost multipliers, exact values only.
    const amountFor = (membershipUntil: string | null, result: XpResult) =>
      xpFor(gameType, result, levelFor(membershipUntil));

    const whiteResult: XpResult = draw ? "draw" : whiteWon ? "win" : "loss";
    const blackResult: XpResult = draw ? "draw" : blackWon ? "win" : "loss";
    const whiteXp = amountFor(white.membership_until ?? null, whiteResult);
    const blackXp = amountFor(black.membership_until ?? null, blackResult);

    // Daily earn cap per player (anti-farming): count today's events
    // first. Grants may be negative (a free-game loss costs XP); the cap
    // only limits EARNING — a loss always deducts so players can never
    // farm their way around it.
    const todayStart = new Date(new Date().getTime() + 2 * 3600_000).toISOString().slice(0, 10) + "T00:00:00.000Z";
    const { data: todayEvents } = await admin
      .from("league_xp_events")
      .select("user_id, amount")
      .in("user_id", [g.white_player_id, g.black_player_id])
      .gte("created_at", todayStart);
    const spent = new Map<string, number>();
    for (const e of todayEvents ?? []) spent.set(e.user_id, (spent.get(e.user_id) ?? 0) + e.amount);

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
    grantFor(g.white_player_id, whiteXp, `${gameType}_${whiteResult}`);
    grantFor(g.black_player_id, blackXp, `${gameType}_${blackResult}`);
    if (grants.length === 0) return;

    // Insert events; unique(user, kind, game) makes this idempotent —
    // XP is awarded exactly once per completed game.
    const { data: inserted, error: insertError } = await admin
      .from("league_xp_events")
      .insert(
        grants.map((gr) => ({
          user_id: gr.userId,
          game_kind: kind,
          game_id: opts.gameId,
          amount: gr.amount,
          reason: gr.reason,
          week_start: cycle, // month key (yyyy-mm-01) — column predates the monthly cycle
        }))
      )
      .select("user_id, amount");
    if (insertError || !inserted?.length) return; // conflict => already processed

    const playerRows = [g.white_player_id, g.black_player_id];

    // ── Referral activation hook (owner decision 2026-09-15) ────────────
    // A finished game counts toward the referred player's activation
    // (3 games) — staked battles activate immediately. The DB function
    // ignores players without a pending referral and is idempotent.
    // Never throws: activation problems must not break game settlement.
    for (const p of playerRows) {
      try {
        await admin.rpc("check_referral_activation", {
          p_user_id: p,
          p_action: gameType === "cash" ? "battle" : "game",
        });
      } catch (actErr) {
        console.error("referral activation check failed:", actErr);
      }
    }

    // Upsert memberships: monthly xp + lifetime_xp (never resets).
    for (const p of playerRows) {
      const grant = inserted.find((e) => e.user_id === p);
      if (!grant) continue;
      const { data: member } = await admin.from("league_xp_members").select("*").eq("user_id", p).maybeSingle();
      if (!member) {
        await admin.from("league_xp_members").insert({
          user_id: p,
          tier: 1, // single leaderboard — column kept for history
          xp: grant.amount,
          week_start: cycle, // month key
          lifetime_xp: grant.amount,
        });
      } else if (member.week_start === cycle) {
        await admin
          .from("league_xp_members")
          .update({
            xp: (member.xp ?? 0) + grant.amount,
            lifetime_xp: (member.lifetime_xp ?? 0) + grant.amount,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", p);
      } else {
        // Stale cycle (user played before this month's cron reset ran) —
        // fresh monthly cycle; lifetime keeps accumulating.
        await admin
          .from("league_xp_members")
          .update({
            xp: grant.amount,
            week_start: cycle,
            lifetime_xp: (member.lifetime_xp ?? 0) + grant.amount,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", p);
      }
    }
  } catch (err) {
    console.error("awardGameXp failed:", err);
  }
}

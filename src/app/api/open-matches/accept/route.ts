import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONFIG, calcPayout } from "@/lib/battles/battle-helpers";
import { moneySymbol } from "@/lib/geo/format";

const TIME_CONTROLS: Record<string, { minutes: number; increment: number; base: string }> = {
  bullet:    { minutes: 1,  increment: 0, base: "bullet" },
  blitz3:    { minutes: 3,  increment: 2, base: "blitz" },
  blitz:     { minutes: 5,  increment: 0, base: "blitz" },
  rapid:     { minutes: 10, increment: 0, base: "rapid" },
  rapid15:   { minutes: 15, increment: 10, base: "rapid" },
  classical: { minutes: 30, increment: 0, base: "classical" },
};

/**
 * POST /api/open-matches/accept
 * Body: { entryId, type: "quick_match" | "battle" }
 *
 * Atomically claims the specific queue entry and creates a game/battle.
 * Returns { gameId } or { battleId } so the banner can redirect immediately.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch user's country for currency display
  const { data: _profile } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", user.id)
    .single();
  const sym = moneySymbol(_profile?.country);

    const { entryId, type } = await req.json();
    if (!entryId || !type) return NextResponse.json({ error: "Missing entryId or type" }, { status: 400 });

    const admin = createAdminClient();

    // ─── Get acceptor profile ──────────────────────────────────────────
    const { data: acceptor } = await admin
      .from("profiles")
      .select("id, rating, wallet_balance, games_played")
      .eq("id", user.id)
      .single();
    if (!acceptor) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    if (type === "quick_match") {
      // ─── Accept a Quick Match / Free Play entry ───────────────────────
      const { data: entry, error } = await admin
        .from("matchmaking_queue")
        .select("id, player_id, time_control, rated, rating")
        .eq("id", entryId)
        .single();

      if (error || !entry) return NextResponse.json({ error: "This player is no longer waiting" }, { status: 404 });

      if (entry.player_id === user.id) return NextResponse.json({ error: "You can't accept your own match" }, { status: 400 });

      // Atomically delete the queue entry (claim it)
      const { error: claimErr } = await admin
        .from("matchmaking_queue")
        .delete()
        .eq("id", entryId);

      // Also remove acceptor's own queue entry if they have one
      await admin.from("matchmaking_queue").delete().eq("player_id", user.id);

      const tc = TIME_CONTROLS[entry.time_control] || TIME_CONTROLS.blitz;

      const { data: gameId, error: gameErr } = await admin.rpc("create_game", {
        p_white_id: entry.player_id,
        p_black_id: user.id,
        p_white_rating: entry.rating,
        p_black_rating: acceptor.rating || 1200,
        p_time_control: tc.base,
        p_initial_minutes: tc.minutes,
        p_increment_seconds: tc.increment,
        p_rated: entry.rated ?? true,
      });

      if (gameErr || !gameId) return NextResponse.json({ error: "Failed to create game" }, { status: 500 });

      return NextResponse.json({ gameId, type: "quick_match" });

    } else if (type === "battle") {
      // ─── Accept a Battle Queue entry ──────────────────────────────────
      const { data: entry, error } = await admin
        .from("battle_queue")
        .select("id, player_id, stake, rating, time_control")
        .eq("id", entryId)
        .eq("status", "waiting")
        .single();

      if (error || !entry) return NextResponse.json({ error: "This battle is no longer available" }, { status: 404 });

      if (entry.player_id === user.id) return NextResponse.json({ error: "You can't accept your own battle" }, { status: 400 });

      // Check acceptor balance
      const balance = acceptor.wallet_balance ?? 0;
      if (balance < entry.stake) {
        return NextResponse.json({
          error: `Insufficient balance. You need ${sym} ${entry.stake.toLocaleString()}.`,
          insufficientFunds: true,
          requiredAmount: entry.stake,
        }, { status: 402 });
      }

      // Atomically claim the queue entry
      const { data: claimed, error: claimErr } = await admin
        .from("battle_queue")
        .update({ status: "matched", matched_at: new Date().toISOString() })
        .eq("id", entryId)
        .eq("status", "waiting")
        .select("*")
        .single();

      if (claimErr || !claimed) return NextResponse.json({ error: "Battle was just taken by someone else" }, { status: 400 });

      // Debit acceptor's stake
      const { error: debitErr } = await admin.rpc("debit_wallet", {
        p_user_id: user.id,
        p_amount: entry.stake,
      });

      if (debitErr) {
        // Revert claim
        await admin.from("battle_queue").update({ status: "waiting", matched_at: null }).eq("id", entryId);
        return NextResponse.json({ error: "Failed to lock your stake" }, { status: 500 });
      }

      await admin.from("deposits").insert({
        user_id: user.id,
        amount: entry.stake,
        status: "success",
        method: "battle_escrow",
        reference: `banner_accept:${user.id}:${entry.stake}`,
      });

      // Get battle config
      const { data: configRow } = await admin.from("battle_config").select("*").limit(1).single();
      const config = { ...DEFAULT_CONFIG, ...configRow };
      const { pot, fee, payout } = calcPayout(entry.stake, config.platform_fee_pct);

      // Random color
      let whitePlayer = entry.player_id;
      let blackPlayer = user.id;
      if (Math.random() > 0.5) {
        whitePlayer = user.id;
        blackPlayer = entry.player_id;
      }

      const { data: challengerProfile } = await admin
        .from("profiles")
        .select("rating")
        .eq("id", entry.player_id)
        .single();

      const { data: battle, error: battleErr } = await admin
        .from("battles")
        .insert({
          white_player_id: whitePlayer,
          black_player_id: blackPlayer,
          stake: entry.stake,
          pot: pot,
          platform_fee: fee,
          winner_payout: payout,
          status: "pending",
          white_rating: whitePlayer === user.id ? acceptor.rating ?? 1200 : challengerProfile?.rating ?? 1200,
          black_rating: blackPlayer === user.id ? acceptor.rating ?? 1200 : challengerProfile?.rating ?? 1200,
        })
        .select("id")
        .single();

      if (battleErr || !battle) {
        // Refund + revert
        await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount: entry.stake });
        await admin.from("battle_queue").update({ status: "waiting", matched_at: null }).eq("id", entryId);
        return NextResponse.json({ error: "Failed to create battle" }, { status: 500 });
      }

      // Link queue entry to battle
      await admin.from("battle_queue").update({ battle_id: battle.id, status: "matched" }).eq("id", entryId);

      // Start the game with the battle's time control
      const tc = TIME_CONTROLS[entry.time_control || "rapid15"] || TIME_CONTROLS.rapid15;
      const { data: gameId } = await admin.rpc("create_game", {
        p_white_id: whitePlayer,
        p_black_id: blackPlayer,
        p_white_rating: whitePlayer === user.id ? acceptor.rating ?? 1200 : challengerProfile?.rating ?? 1200,
        p_black_rating: blackPlayer === user.id ? acceptor.rating ?? 1200 : challengerProfile?.rating ?? 1200,
        p_time_control: tc.base,
        p_initial_minutes: tc.minutes,
        p_increment_seconds: tc.increment,
        p_rated: true,
      });

      if (gameId) {
        await admin.from("battles").update({ game_id: gameId, status: "playing" }).eq("id", battle.id);
        return NextResponse.json({ battleId: battle.id, gameId, type: "battle" });
      }

      return NextResponse.json({ battleId: battle.id, type: "battle" });

    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to accept match" }, { status: 500 });
  }
}

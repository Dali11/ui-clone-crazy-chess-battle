import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // ─── Fetch user profile (full details) ──────────────────────────────
    const { data: userProfile, error: profileErr } = await admin
      .from("profiles")
      .select(`
        id, username, display_name, email, avatar_url, bio, country, phone,
        rating, rating_deviation, rating_volatility,
        games_played, wins, losses, draws,
        tournaments_played, tournaments_won,
        wallet_balance,
        is_admin, is_banned,
        gender, identity_verified,
        created_at, updated_at
      `)
      .eq("id", id)
      .single();

    if (profileErr || !userProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Recent games (last 20) ──────────────────────────────────────────
    const { data: games } = await admin
      .from("games")
      .select(`
        id, status, winner, time_control, move_count, rated, opening,
        white_player_id, black_player_id, white_rating, black_rating,
        white_rating_change, black_rating_change,
        tournament_id, created_at, ended_at,
        white_player:profiles!games_white_player_id_fkey(username),
        black_player:profiles!games_black_player_id_fkey(username)
      `)
      .or(`white_player_id.eq.${id},black_player_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(20);

    // ─── Deposits (last 20) ──────────────────────────────────────────────
    const { data: deposits } = await admin
      .from("deposits")
      .select("id, amount, status, method, charge_id, tx_ref, phone, operator, reference, admin_notes, created_at, updated_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    // ─── Withdrawals (last 20) ───────────────────────────────────────────
    const { data: withdrawals } = await admin
      .from("withdrawals")
      .select("id, amount, fee, net_amount, phone, operator_name, status, charge_id, admin_notes, processed_at, created_at, updated_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Note: there's no dedicated wallet ledger table — wallet_balance lives on
    // profiles and is derived from deposits/withdrawals/battle settlements.
    const transactions: any[] = [];

    // ─── Battles (last 20) ────────────────────────────────────────────────
    // battles.white_player_id / black_player_id / winner_id reference
    // auth.users, not profiles, so we can't embed profiles via FK hint —
    // fetch battles raw, then batch-resolve usernames from profiles.
    const { data: rawBattles } = await admin
      .from("battles")
      .select(`
        id, stake, status, winner_id, created_at, completed_at,
        white_player_id, black_player_id
      `)
      .or(`white_player_id.eq.${id},black_player_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(20);

    let battles: any[] = [];
    if (rawBattles && rawBattles.length > 0) {
      const playerIds = Array.from(
        new Set(rawBattles.flatMap((b) => [b.white_player_id, b.black_player_id]).filter(Boolean))
      );
      const { data: battlePlayers } = await admin
        .from("profiles")
        .select("id, username")
        .in("id", playerIds);
      const byId = new Map((battlePlayers || []).map((pl) => [pl.id, pl.username]));
      battles = rawBattles.map((b) => ({
        id: b.id,
        stake_amount: b.stake,
        status: b.status,
        winner_id: b.winner_id,
        created_at: b.created_at,
        ended_at: b.completed_at,
        white_player: { username: byId.get(b.white_player_id) || null },
        black_player: { username: byId.get(b.black_player_id) || null },
      }));
    }

    // ─── Tournament participations ──────────────────────────────────────
    const { data: tournaments } = await admin
      .from("tournament_participants")
      .select(`
        id, score, games_played, wins, losses, draws, final_rank, status, joined_at,
        tournament:tournaments(id, name, type, status, starts_at)
      `)
      .eq("player_id", id)
      .order("joined_at", { ascending: false })
      .limit(20);

    // ─── League registrations ────────────────────────────────────────────
    const { data: leagues } = await admin
      .from("league_registrations")
      .select(`
        id, status, qualified, qualification_reason, registered_at, reviewed_at,
        league:premier_leagues(id, name, tier)
      `)
      .eq("player_id", id)
      .order("registered_at", { ascending: false })
      .limit(10);

    // ─── Referrals ────────────────────────────────────────────────────────
    // referrals.referrer_id / referred_id reference auth.users, not profiles —
    // same FK-embed limitation as battles, so resolve usernames manually.
    const { data: rawReferralsMade } = await admin
      .from("referrals")
      .select("id, status, reward_amount, created_at, referred_id")
      .eq("referrer_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: rawReferralReceived } = await admin
      .from("referrals")
      .select("id, status, reward_amount, created_at, referrer_id")
      .eq("referred_id", id)
      .order("created_at", { ascending: false })
      .limit(1);

    const referralUserIds = Array.from(
      new Set([
        ...(rawReferralsMade || []).map((r) => r.referred_id),
        ...(rawReferralReceived || []).map((r) => r.referrer_id),
      ].filter(Boolean))
    );
    let referralProfilesById = new Map<string, { username: string; email: string }>();
    if (referralUserIds.length > 0) {
      const { data: referralProfiles } = await admin
        .from("profiles")
        .select("id, username, email")
        .in("id", referralUserIds);
      referralProfilesById = new Map(
        (referralProfiles || []).map((rp) => [rp.id, { username: rp.username, email: rp.email }])
      );
    }

    const referralsMade = (rawReferralsMade || []).map((r) => ({
      id: r.id,
      status: r.status,
      reward_amount: r.reward_amount,
      created_at: r.created_at,
      referred: referralProfilesById.get(r.referred_id) || null,
    }));

    const referralReceivedRaw = rawReferralReceived?.[0];
    const referralReceived = referralReceivedRaw
      ? {
          id: referralReceivedRaw.id,
          status: referralReceivedRaw.status,
          reward_amount: referralReceivedRaw.reward_amount,
          created_at: referralReceivedRaw.created_at,
          referrer: referralProfilesById.get(referralReceivedRaw.referrer_id) || null,
        }
      : null;

    // ─── Admin logs for this user ────────────────────────────────────────
    const { data: adminActions } = await admin
      .from("admin_logs")
      .select("id, action, details, created_at, actor:profiles!admin_logs_admin_id_fkey(username)")
      .eq("target_id", id)
      .eq("target_type", "user")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      profile: userProfile,
      games: games || [],
      deposits: deposits || [],
      withdrawals: withdrawals || [],
      transactions,
      battles,
      tournaments: tournaments || [],
      leagues: leagues || [],
      referralsMade,
      referralReceived,
      adminActions: adminActions || [],
    });
  } catch (err: any) {
    console.error("User overview error:", err);
    return NextResponse.json({ error: "Failed to load user overview" }, { status: 500 });
  }
}

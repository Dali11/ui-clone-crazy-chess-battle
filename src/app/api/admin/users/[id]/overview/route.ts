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
        wallet_balance, wallet_balance_cents,
        is_admin, is_banned,
        gender, gender_locked, identity_verified,
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

    // ─── Wallet transactions (last 20) ───────────────────────────────────
    const { data: transactions } = await admin
      .from("wallet_transactions")
      .select("id, type, amount, status, description, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    // ─── Battles (last 20) ───────────────────────────────────────────────
    const { data: battles } = await admin
      .from("battles")
      .select(`
        id, stake_amount, status, winner_id, created_at, ended_at,
        white_player:profiles!battles_white_player_id_fkey(username),
        black_player:profiles!battles_black_player_id_fkey(username)
      `)
      .or(`white_player_id.eq.${id},black_player_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(20);

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

    // ─── Referrals ──────────────────────────────────────────────────────
    const { data: referralsMade } = await admin
      .from("referrals")
      .select(`
        id, status, reward_amount, created_at,
        referred:profiles!referrals_referred_id_fkey(username, email)
      `)
      .eq("referrer_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: referralReceived } = await admin
      .from("referrals")
      .select(`
        id, status, reward_amount, created_at,
        referrer:profiles!referrals_referrer_id_fkey(username, email)
      `)
      .eq("referred_id", id)
      .order("created_at", { ascending: false })
      .limit(1);

    // ─── Admin logs for this user ────────────────────────────────────────
    const { data: adminActions } = await admin
      .from("admin_logs")
      .select("id, action, details, created_at, actor:profiles!admin_logs_actor_id_fkey(username)")
      .eq("target_id", id)
      .eq("target_type", "user")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      profile: userProfile,
      games: games || [],
      deposits: deposits || [],
      withdrawals: withdrawals || [],
      transactions: transactions || [],
      battles: battles || [],
      tournaments: tournaments || [],
      leagues: leagues || [],
      referralsMade: referralsMade || [],
      referralReceived: referralReceived?.[0] || null,
      adminActions: adminActions || [],
    });
  } catch (err: any) {
    console.error("User overview error:", err);
    return NextResponse.json({ error: "Failed to load user overview" }, { status: 500 });
  }
}

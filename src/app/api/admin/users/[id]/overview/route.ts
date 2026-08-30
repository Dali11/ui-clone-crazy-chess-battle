import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLedgerMeta, ledgerDisplayAmount, WITHDRAWAL_META } from "@/lib/wallet-ledger";

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

    // ─── Real cash deposited (mobile_money/card, successful only) ────────
    // This is the number that actually matters for "how much real money has
    // this user put in" — distinct from the internal ledger (escrow,
    // payouts, tournament fees) that also lives in the `deposits` table.
    const { data: cashDepositRows } = await admin
      .from("deposits")
      .select("amount")
      .eq("user_id", id)
      .in("method", ["mobile_money", "card"])
      .eq("status", "success");
    const cashDepositTotal = (cashDepositRows || []).reduce((sum, r) => sum + (r.amount || 0), 0);

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

    // ─── Wallet ledger (last 30) ──────────────────────────────────────────
    // The `deposits` table is actually a general wallet ledger: real cash
    // deposits (mobile_money/card) AND internal movements (battle escrow,
    // battle payouts/refunds, tournament entries/prizes, admin corrections)
    // all live here under different `method` values. We classify each row
    // as inflow/outflow via the shared wallet-ledger helper — the stored
    // amount sign alone is NOT reliable (e.g. escrow rows are stored positive
    // even though they're money leaving the wallet).
    const { data: rawDeposits } = await admin
      .from("deposits")
      .select("id, amount, status, method, charge_id, tx_ref, phone, operator, reference, admin_notes, created_at, updated_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(30);

    const deposits = (rawDeposits || []).map((d) => {
      const meta = getLedgerMeta(d.method);
      return {
        ...d,
        label: meta.label,
        direction: meta.direction,
        display_amount: ledgerDisplayAmount(d.amount, meta.direction),
      };
    });

    // ─── Withdrawals (last 20) — always outflow ──────────────────────────
    const { data: rawWithdrawals } = await admin
      .from("withdrawals")
      .select("id, amount, fee, net_amount, phone, operator_name, status, charge_id, admin_notes, processed_at, created_at, updated_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    const withdrawals = (rawWithdrawals || []).map((w) => ({
      ...w,
      label: WITHDRAWAL_META.label,
      direction: WITHDRAWAL_META.direction,
      display_amount: ledgerDisplayAmount(w.net_amount ?? w.amount, WITHDRAWAL_META.direction),
    }));

    // ─── Unified wallet activity feed — cash deposits + ledger + withdrawals,
    // all pre-classified in/out so the UI never has to guess ──────────────
    const transactions = [
      ...deposits.map((d) => ({
        id: d.id,
        label: d.label,
        direction: d.direction,
        display_amount: d.display_amount,
        status: d.status,
        created_at: d.created_at,
      })),
      ...withdrawals.map((w) => ({
        id: w.id,
        label: w.label,
        direction: w.direction,
        display_amount: w.display_amount,
        status: w.status,
        created_at: w.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
      .select("id, status, commission_amount, created_at, referred_id")
      .eq("referrer_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: rawReferralReceived } = await admin
      .from("referrals")
      .select("id, status, commission_amount, created_at, referrer_id")
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
      reward_amount: r.commission_amount || 0,
      created_at: r.created_at,
      referred: referralProfilesById.get(r.referred_id) || null,
    }));

    const referralReceivedRaw = rawReferralReceived?.[0];
    const referralReceived = referralReceivedRaw
      ? {
          id: referralReceivedRaw.id,
          status: referralReceivedRaw.status,
          reward_amount: referralReceivedRaw.commission_amount || 0,
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
      cashDepositTotal,
      games: games || [],
      deposits,
      withdrawals,
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

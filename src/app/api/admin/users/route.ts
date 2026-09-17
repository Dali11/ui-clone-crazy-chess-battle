import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sendEmail } from "@/lib/email";

// GET — list users (server-side search, filters, sort, pagination) + KPIs
export async function GET(req: NextRequest) {
  try {
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

    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status") || "all"; // all|new|active|admins|banned|negative
    const sort = searchParams.get("sort") || "newest"; // newest|oldest|rating|games|wallet|username
    const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10) || 0);
    const pageSize = Math.min(200, Math.max(10, parseInt(searchParams.get("page_size") || "50", 10) || 50));

    // ── KPIs — aggregate over the whole userbase (light fields only) ──
    // fetchAll(): PostgREST silently caps responses at 1000 rows — an
    // unbounded scan would freeze every KPI at exactly 1000 users.
    const rows = await fetchAll(() =>
      admin.from("profiles")
        .select("created_at, is_banned, is_admin, games_played, wallet_balance, rating"));
    // CAT (UTC+2, no DST) calendar-day anchoring — "new in 7d/30d" counts the
    // last 7/30 calendar days including today (today starts at CAT midnight),
    // matching the Overview/Battles panel scope semantics.
    const CAT_OFFSET_MS = 2 * 60 * 60 * 1000;
    const cat = new Date(Date.now() + CAT_OFFSET_MS);
    const midnight = Date.UTC(cat.getUTCFullYear(), cat.getUTCMonth(), cat.getUTCDate()) - CAT_OFFSET_MS;
    const d7 = midnight - 6 * 864e5;
    const d30 = midnight - 29 * 864e5;
    const rated = rows.filter((r: any) => r.rating != null);
    const kpis = {
      total: rows.length,
      new_7d: rows.filter((r: any) => new Date(r.created_at).getTime() >= d7).length,
      new_30d: rows.filter((r: any) => new Date(r.created_at).getTime() >= d30).length,
      active_players: rows.filter((r: any) => (r.games_played || 0) > 0).length,
      banned: rows.filter((r: any) => r.is_banned).length,
      admins: rows.filter((r: any) => r.is_admin).length,
      negative_wallets: rows.filter((r: any) => (r.wallet_balance || 0) < 0).length,
      wallet_liability: rows.reduce((s: number, r: any) => s + (r.wallet_balance || 0), 0),
      avg_rating: rated.length ? Math.round(rated.reduce((s: number, r: any) => s + r.rating, 0) / rated.length) : 0,
    };

    // ── Paginated list ──
    let query = admin
      .from("profiles")
      .select("id, username, display_name, email, rating, games_played, wins, losses, draws, wallet_balance, is_admin, is_banned, phone, country, created_at", { count: "exact" });

    if (country) query = query.eq("country", country);
    if (search) query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%,display_name.ilike.%${search}%`);

    switch (status) {
      case "new": query = query.gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()); break;
      case "active": query = query.gt("games_played", 0); break;
      case "admins": query = query.eq("is_admin", true); break;
      case "banned": query = query.eq("is_banned", true); break;
      case "negative": query = query.lt("wallet_balance", 0); break;
    }

    switch (sort) {
      case "oldest": query = query.order("created_at", { ascending: true }); break;
      case "rating": query = query.order("rating", { ascending: false, nullsFirst: false }); break;
      case "games": query = query.order("games_played", { ascending: false, nullsFirst: false }); break;
      case "wallet": query = query.order("wallet_balance", { ascending: false, nullsFirst: false }); break;
      case "username": query = query.order("username", { ascending: true }); break;
      default: query = query.order("created_at", { ascending: false });
    }

    query = query.range(page * pageSize, (page + 1) * pageSize - 1);

    const { data: users, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ users, total: count ?? 0, page, page_size: pageSize, kpis });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

// PATCH — manage a user (ban/unban, toggle admin, adjust rating, adjust wallet)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { userId, action, value, reason } = body;

    if (!userId || !action) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

    // Prevent self-ban/self-delete
    if (userId === user.id && (action === "ban" || action === "delete")) {
      return NextResponse.json({ error: "You cannot ban or delete yourself" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    switch (action) {
      case "wallet_adjustment": {
        // Signed amount + mandatory reason. Goes through
        // apply_financial_adjustment (same primitive as Command Centre
        // reconciliation): ledger row + wallet RPC + audit entry.
        // Wallet balances are never edited directly.
        //
        // Amount currency: MWK (default, legacy callers) or one of the
        // dossier's display currencies — "USD" or "local" (the player's
        // own wallet currency, resolved from their profile country).
        // Non-MWK inputs are converted to MWK with the same shared FX
        // converter the Command Centre reports use.
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount === 0)
          return NextResponse.json({ error: "Adjustment amount must be a non-zero number" }, { status: 400 });
        const adjReason = typeof reason === "string" ? reason : "";
        if (adjReason.trim().length < 3)
          return NextResponse.json({ error: "A reason of at least 3 characters is required" }, { status: 400 });

        let amountMwk = Math.round(amount);
        const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "MWK";
        if (currency && currency !== "MWK") {
          const { COUNTRY_CURRENCY } = await import("@/lib/geo/currency-map");
          const { loadUsdConverter } = await import("@/lib/finance/usd");
          const { getExchangeRate } = await import("@/lib/geo/fx");
          const { data: target } = await admin
            .from("profiles")
            .select("country")
            .eq("id", userId)
            .single();
          const walletCurrency = COUNTRY_CURRENCY[(target?.country || "").toUpperCase()] || "MWK";
          const fx = await loadUsdConverter(admin, async () => getExchangeRate("MWK", "USD"));
          const denom = currency === "USD" ? "USD" : walletCurrency;
          const converted = fx.toMwk(amount, denom);
          if (converted == null)
            return NextResponse.json(
              { error: `Exchange rate unavailable — cannot convert ${denom} to MWK right now` },
              { status: 503 }
            );
          amountMwk = Math.round(converted);
        }

        const { error } = await admin.rpc("apply_financial_adjustment", {
          p_admin_id: user.id,
          p_player_id: userId,
          p_amount_mwk: amountMwk,
          p_reason: adjReason.trim(),
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        break;
      }
      case "ban":
        updates.is_banned = true;
        break;
      case "unban":
        updates.is_banned = false;
        break;
      case "toggle_admin":
        updates.is_admin = !!value;
        break;
      case "adjust_rating":
        if (typeof value !== "number" || value < 0 || value > 4000)
          return NextResponse.json({ error: "Rating must be 0-4000" }, { status: 400 });
        updates.rating = value;
        break;
      case "adjust_wallet":
        if (typeof value !== "number")
          return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
        if (value > 0) {
          const { error } = await admin.rpc("credit_wallet", {
            p_user_id: userId,
            p_amount: value,
          });
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        } else if (value < 0) {
          const { error } = await admin.rpc("debit_wallet", {
            p_user_id: userId,
            p_amount: Math.abs(value),
          });
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
        break;
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // Apply profile updates if any
    if (Object.keys(updates).length > 0) {
      const { error } = await admin.from("profiles").update(updates).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the action
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: `user_${action}`,
        target_type: "user",
        target_id: userId,
        details: { value, reason: reason ?? null },
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE — permanently delete a user and all their data
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!adminProfile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    // Prevent self-delete
    if (userId === user.id) {
      return NextResponse.json({ error: "You cannot delete yourself" }, { status: 400 });
    }

    // Get the user's profile for logging
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("username, email, wallet_balance")
      .eq("id", userId)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 1. Cancel any active battles where the user is a participant
    await admin.from("battles")
      .update({ status: "cancelled", winner_id: null })
      .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
      .in("status", ["waiting", "active"])
      .then(() => {});

    // 2. Remove from active tournaments
    const { data: tournamentParticipations } = await admin
      .from("tournament_participants")
      .select("id, tournament_id, paid")
      .eq("player_id", userId)
      .eq("status", "registered");

    if (tournamentParticipations && tournamentParticipations.length > 0) {
      for (const p of tournamentParticipations) {
        await admin.from("tournament_participants")
          .update({ status: "withdrawn" })
          .eq("id", p.id);
        
        if (p.paid) {
          const { data: tournament } = await admin
            .from("tournaments")
            .select("entry_fee, creator_id")
            .eq("id", p.tournament_id)
            .single();
          
          if (tournament && tournament.entry_fee > 0) {
            await admin.rpc("credit_wallet", {
              p_user_id: tournament.creator_id,
              p_amount: tournament.entry_fee,
            });
          }
        }
      }
    }

    // 6. Delete referrals
    await admin.from("referrals").delete().eq("referrer_id", userId);
    await admin.from("referrals").delete().eq("referred_id", userId);

    // 7. Delete deposits
    await admin.from("deposits").delete().eq("user_id", userId);

    // 8. Delete withdrawals
    await admin.from("withdrawals").delete().eq("user_id", userId);

    // 9. Delete tournament participants records
    await admin.from("tournament_participants").delete().eq("player_id", userId);

    // 10. Delete tournament rounds (as player)
    await admin.from("tournament_rounds").delete().eq("player_id", userId);

    // 11. Delete battle challenges
    await admin.from("battle_challenges").delete().eq("challenger_id", userId);

    // 12. Delete the profile
    const { error: profileDeleteError } = await admin
      .from("profiles").delete().eq("id", userId);

    if (profileDeleteError) {
      console.error("Profile delete error:", profileDeleteError);
      return NextResponse.json({ error: "Failed to delete profile: " + profileDeleteError.message }, { status: 500 });
    }

    // 13. Delete the auth user
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error("Auth user delete error:", authDeleteError);
      return NextResponse.json({ 
        success: true, 
        warning: "Profile deleted but auth user removal failed: " + authDeleteError.message 
      });
    }

    // Log the action
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "user_delete",
        target_type: "user",
        target_id: userId,
        details: { 
          deleted_username: targetProfile.username,
          deleted_email: targetProfile.email,
          wallet_balance: targetProfile.wallet_balance,
        },
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Delete user error:", e);
    return NextResponse.json({ error: e.message || "Failed to delete user" }, { status: 500 });
  }
}

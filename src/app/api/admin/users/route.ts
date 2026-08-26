import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

// GET — list all users
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

    const { data: users, error } = await admin
      .from("profiles")
      .select("id, username, display_name, email, rating, games_played, wins, losses, draws, wallet_balance_cents, is_admin, is_banned, phone, berry_balance, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

// PATCH — manage a user (ban/unban, toggle admin, adjust rating, adjust wallet, grant berries)
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
    const { userId, action, value } = body;

    if (!userId || !action) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

    // Prevent self-ban/self-delete
    if (userId === user.id && (action === "ban" || action === "delete")) {
      return NextResponse.json({ error: "You cannot ban or delete yourself" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    switch (action) {
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
            p_amount_cents: value,
          });
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        } else if (value < 0) {
          const { error } = await admin.rpc("debit_wallet", {
            p_user_id: userId,
            p_amount_cents: Math.abs(value),
          });
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
        break;
      case "grant_berries":
        if (typeof value !== "number" || value <= 0)
          return NextResponse.json({ error: "Invalid berry amount" }, { status: 400 });
        const { error: berryErr } = await admin.rpc("credit_berries", {
          p_user_id: userId,
          p_amount: value,
          p_description: "Admin grant",
        });
        if (berryErr) return NextResponse.json({ error: berryErr.message }, { status: 500 });
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
        details: { value },
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
      .select("username, email, wallet_balance_cents, berry_balance")
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

    // 2. Remove from active tournaments (refund if paid)
    const { data: tournamentParticipations } = await admin
      .from("tournament_participants")
      .select("id, tournament_id, paid")
      .eq("player_id", userId)
      .eq("status", "registered");

    if (tournamentParticipations && tournamentParticipations.length > 0) {
      for (const p of tournamentParticipations) {
        // Mark as withdrawn
        await admin.from("tournament_participants")
          .update({ status: "withdrawn" })
          .eq("id", p.id);
        
        // If they paid, refund the tournament creator's prize pool
        if (p.paid) {
          const { data: tournament } = await admin
            .from("tournaments")
            .select("entry_fee_cents, creator_id")
            .eq("id", p.tournament_id)
            .single();
          
          if (tournament && tournament.entry_fee_cents > 0) {
            await admin.rpc("credit_wallet", {
              p_user_id: tournament.creator_id,
              p_amount_cents: tournament.entry_fee_cents,
            });
          }
        }
      }
    }

    // 3. Delete game records (set player IDs to null via FK ON DELETE SET NULL, or delete)
    // Games table has ON DELETE SET NULL for player IDs, so deleting the profile
    // will handle this. But we also want to clean up the game records themselves
    // for bot games where the user is the only human player.
    
    // 4. Delete berry transactions
    await admin.from("berry_transactions").delete().eq("user_id", userId);

    // 5. Delete berry balances
    await admin.from("berry_balances").delete().eq("user_id", userId);

    // 6. Delete referrals (both as referrer and referred)
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

    // 13. Delete the auth user (this is the nuclear option)
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error("Auth user delete error:", authDeleteError);
      // Profile was already deleted, so this is partial — log it
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
          wallet_balance: targetProfile.wallet_balance_cents,
          berry_balance: targetProfile.berry_balance,
        },
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Delete user error:", e);
    return NextResponse.json({ error: e.message || "Failed to delete user" }, { status: 500 });
  }
}

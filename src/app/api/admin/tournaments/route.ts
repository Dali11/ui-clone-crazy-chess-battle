import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishTournament } from "@/lib/tournament/finish";
import { PRIZE_SPLITS_BY_TYPE, DEFAULT_PRIZE_SPLITS } from "@/lib/tournament/prizes";

// GET — list all tournaments with participant counts
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: tournaments, error } = await admin
      .from("tournaments")
      .select(`
        id, name, description, type, status, time_control, initial_minutes, increment_seconds,
        entry_fee, prize_pool, prize_distribution, pool_source,
        max_players, min_rating, max_rating, current_round, rounds, duration_minutes,
        starts_at, ends_at, created_at, created_by
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get participant counts (total + paid)
    const tournamentIds = tournaments?.map(t => t.id) || [];
    let participantCounts: Record<string, number> = {};
    let paidCounts: Record<string, number> = {};
    if (tournamentIds.length > 0) {
      const { data: participants } = await admin
        .from("tournament_participants")
        .select("tournament_id, paid_entry_fee")
        .in("tournament_id", tournamentIds);
      for (const p of participants || []) {
        participantCounts[p.tournament_id] = (participantCounts[p.tournament_id] || 0) + 1;
        if (p.paid_entry_fee) {
          paidCounts[p.tournament_id] = (paidCounts[p.tournament_id] || 0) + 1;
        }
      }
    }

    return NextResponse.json({
      tournaments: tournaments?.map(t => ({
        ...t,
        participant_count: participantCounts[t.id] || 0,
        paid_count: paidCounts[t.id] || 0,
        revenue: ((paidCounts[t.id] || 0) * (t.entry_fee || 0)),
      })) || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch tournaments" }, { status: 500 });
  }
}

// PATCH — cancel, force-finish, edit, or update prize distribution
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
    const { tournamentId, action } = body;
    if (!tournamentId || !action) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

    // ── Edit tournament details ──
    if (action === "edit") {
      // Only allow editing upcoming tournaments
      const { data: tournament } = await admin
        .from("tournaments").select("status").eq("id", tournamentId).single();
      if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
      if (tournament.status !== "upcoming") {
        return NextResponse.json({ error: "Can only edit upcoming tournaments" }, { status: 400 });
      }

      const updates: Record<string, any> = {};
      const editableFields = [
        "name", "description", "type", "time_control", "initial_minutes",
        "increment_seconds", "max_players", "min_rating", "max_rating",
        "rounds", "duration_minutes", "starts_at", "ends_at",
        "entry_fee", "prize_pool", "pool_source", "creator_profit_percent"
      ];

      for (const field of editableFields) {
        if (body[field] !== undefined) {
          // Convert numeric fields
          if (["initial_minutes", "increment_seconds", "max_players", "min_rating", "max_rating", "rounds", "duration_minutes", "entry_fee", "prize_pool", "creator_profit_percent"].includes(field)) {
            updates[field] = body[field] === null ? null : Number(body[field]);
          } else {
            updates[field] = body[field];
          }
        }
      }

      // Validate type and time_control against CHECK constraints
      if (updates.type && !["arena", "swiss", "knockout"].includes(updates.type)) {
        return NextResponse.json({ error: "Invalid tournament type" }, { status: 400 });
      }
      if (updates.time_control && !["bullet", "blitz", "rapid", "classical"].includes(updates.time_control)) {
        return NextResponse.json({ error: "Invalid time control" }, { status: 400 });
      }

      // If type changed, update default prize distribution to match
      if (updates.type) {
        const payouts = PRIZE_SPLITS_BY_TYPE[updates.type] || DEFAULT_PRIZE_SPLITS;
        updates.prize_distribution = { type: "percentage", payouts };
      }

      // If prize distribution is explicitly provided
      if (body.prize_distribution) {
        updates.prize_distribution = body.prize_distribution;
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      const { error } = await admin.from("tournaments").update(updates).eq("id", tournamentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id, action: "tournament_edit",
          target_type: "tournament", target_id: tournamentId,
          details: { updated_fields: Object.keys(updates) },
        });
      } catch {}

      return NextResponse.json({ success: true });
    }

    // ── Update prize distribution ──
    if (action === "edit_prizes") {
      const { prize_distribution } = body;
      if (!prize_distribution) return NextResponse.json({ error: "Prize distribution required" }, { status: 400 });

      const { error } = await admin
        .from("tournaments")
        .update({ prize_distribution })
        .eq("id", tournamentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id, action: "tournament_edit_prizes",
          target_type: "tournament", target_id: tournamentId,
        });
      } catch {}

      return NextResponse.json({ success: true });
    }

    // ── Approve pending tournament ──
    if (action === "approve") {
      const { data: tournament } = await admin
        .from("tournaments").select("status").eq("id", tournamentId).single();
      if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
      if (tournament.status !== "pending_approval") {
        return NextResponse.json({ error: "Tournament is not pending approval" }, { status: 400 });
      }

      const { error } = await admin
        .from("tournaments")
        .update({ status: "upcoming" })
        .eq("id", tournamentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id, action: "tournament_approved",
          target_type: "tournament", target_id: tournamentId,
        });
      } catch {}

      return NextResponse.json({ success: true });
    }

    // ── Reject pending tournament ──
    if (action === "reject") {
      const { data: tournament } = await admin
        .from("tournaments").select("status, entry_fee").eq("id", tournamentId).single();
      if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
      if (tournament.status !== "pending_approval") {
        return NextResponse.json({ error: "Tournament is not pending approval" }, { status: 400 });
      }

      const { error } = await admin
        .from("tournaments")
        .update({ status: "rejected", ended_at: new Date().toISOString() })
        .eq("id", tournamentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Refund any paid participants
      const entryFee = tournament.entry_fee || 0;
      if (entryFee > 0) {
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, paid_entry_fee")
          .eq("tournament_id", tournamentId)
          .eq("paid_entry_fee", true);

        for (const p of participants || []) {
          await admin.rpc("credit_wallet", { p_user_id: p.player_id, p_amount: entryFee });
        }
      }

      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id, action: "tournament_rejected",
          target_type: "tournament", target_id: tournamentId,
        });
      } catch {}

      return NextResponse.json({ success: true });
    }

    // ── Cancel with refunds ──
    if (action === "cancel") {
      const now = new Date().toISOString();
      const { error } = await admin
        .from("tournaments")
        .update({ status: "cancelled", ended_at: now })
        .eq("id", tournamentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const { data: tournament } = await admin
        .from("tournaments").select("entry_fee").eq("id", tournamentId).single();
      const entryFee = tournament?.entry_fee || 0;

      if (entryFee > 0) {
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, paid_entry_fee")
          .eq("tournament_id", tournamentId)
          .eq("paid_entry_fee", true);

        for (const p of participants || []) {
          await admin.rpc("credit_wallet", { p_user_id: p.player_id, p_amount: entryFee });
        }
      }
    } else if (action === "force_finish") {
      // ── Force finish + distribute prizes ──
      await finishTournament(tournamentId);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // Log cancel/force_finish
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id, action: `tournament_${action}`,
        target_type: "tournament", target_id: tournamentId,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE — permanently delete a tournament (upcoming, cancelled, or finished)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const tournamentId = url.searchParams.get("id");
    if (!tournamentId) return NextResponse.json({ error: "Tournament ID required" }, { status: 400 });

    // Check tournament status — only allow deleting upcoming or cancelled tournaments
    const { data: tournament } = await admin
      .from("tournaments").select("status, entry_fee").eq("id", tournamentId).single();
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    if (!["upcoming", "cancelled", "finished", "active"].includes(tournament.status)) {
      return NextResponse.json({
        error: "Can only delete upcoming, active, cancelled, or finished tournaments.",
      }, { status: 400 });
    }

    // For finished or active tournaments, delete associated games first
    if (tournament.status === "finished" || tournament.status === "active") {
      const { count: gameCount } = await admin
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId);

      if (gameCount && gameCount > 0) {
        await admin.from("games").delete().eq("tournament_id", tournamentId);
      }
    } else {
      // For upcoming/cancelled: block if games exist (shouldn't have any, but safety check)
      const { count: gameCount } = await admin
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId);

      if (gameCount && gameCount > 0) {
        return NextResponse.json({
          error: `Cannot delete: ${gameCount} games are linked to this tournament. Cancel instead.`,
        }, { status: 400 });
      }
    }

    // Refund any paid participants before deleting (upcoming or active, not finished — prizes already distributed)
    if (tournament.entry_fee > 0 && (tournament.status === "upcoming" || tournament.status === "active")) {
      const { data: participants } = await admin
        .from("tournament_participants")
        .select("player_id, paid_entry_fee")
        .eq("tournament_id", tournamentId)
        .eq("paid_entry_fee", true);

      for (const p of participants || []) {
        await admin.rpc("credit_wallet", { p_user_id: p.player_id, p_amount: tournament.entry_fee });
      }
    }

    // Delete participants, then the tournament
    await admin.from("tournament_participants").delete().eq("tournament_id", tournamentId);
    await admin.from("tournament_rounds").delete().eq("tournament_id", tournamentId);
    const { error } = await admin.from("tournaments").delete().eq("id", tournamentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id, action: "tournament_delete",
        target_type: "tournament", target_id: tournamentId,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// POST — duplicate a tournament
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { tournamentId } = await req.json();
    if (!tournamentId) return NextResponse.json({ error: "Tournament ID required" }, { status: 400 });

    // Fetch the source tournament
    const { data: source, error } = await admin
      .from("tournaments")
      .select(`
        name, description, type, time_control, initial_minutes, increment_seconds,
        max_players, min_rating, max_rating, rounds, duration_minutes,
        entry_fee, prize_pool, prize_distribution, pool_source
      `)
      .eq("id", tournamentId)
      .single();

    if (error || !source) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    // Clone with "(Copy)" suffix, reset status to upcoming, set starts_at to +7 days
    const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString();

    const { data: clone, error: cloneErr } = await admin
      .from("tournaments")
      .insert({
        name: `${source.name} (Copy)`,
        description: source.description,
        type: source.type,
        time_control: source.time_control,
        initial_minutes: source.initial_minutes,
        increment_seconds: source.increment_seconds,
        max_players: source.max_players,
        min_rating: source.min_rating,
        max_rating: source.max_rating,
        rounds: source.rounds,
        duration_minutes: source.duration_minutes,
        starts_at: sevenDaysLater,
        entry_fee: source.entry_fee,
        prize_pool: source.prize_pool,
        pool_source: source.pool_source || 'entry_fees',
        prize_distribution: source.prize_distribution || {
          type: "percentage",
          payouts: PRIZE_SPLITS_BY_TYPE[source.type] || DEFAULT_PRIZE_SPLITS,
        },
        created_by: user.id,
        status: "upcoming",
      })
      .select("id, name, starts_at")
      .single();

    if (cloneErr || !clone) return NextResponse.json({ error: cloneErr?.message || "Failed to duplicate" }, { status: 500 });

    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id, action: "tournament_duplicate",
        target_type: "tournament", target_id: tournamentId,
        details: { clone_id: clone.id },
      });
    } catch {}

    return NextResponse.json({ success: true, clone });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

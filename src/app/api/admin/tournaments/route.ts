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
        max_players, min_players, min_rating, max_rating, current_round, rounds, duration_minutes,
        creator_profit_percent,
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
        .from("tournaments").select("status, max_players").eq("id", tournamentId).single();
      if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
      // The admin UI exposes Edit for both "upcoming" and "active" tournaments
      // (e.g. adjusting creator profit % or total rounds mid-tournament), so
      // the API must allow the same statuses — otherwise saves silently fail
      // for anything already live.
      if (tournament.status !== "upcoming" && tournament.status !== "active") {
        return NextResponse.json({ error: "Can only edit upcoming or active tournaments" }, { status: 400 });
      }

      const updates: Record<string, any> = {};
      const editableFields = [
        "name", "description", "type", "time_control", "initial_minutes",
        "increment_seconds", "max_players", "min_players", "min_rating", "max_rating",
        "rounds", "duration_minutes", "starts_at", "ends_at",
        "entry_fee", "prize_pool", "pool_source", "creator_profit_percent"
      ];

      for (const field of editableFields) {
        if (body[field] !== undefined) {
          // Convert numeric fields
          if (["initial_minutes", "increment_seconds", "max_players", "min_players", "min_rating", "max_rating", "rounds", "duration_minutes", "entry_fee", "prize_pool", "creator_profit_percent"].includes(field)) {
            const numVal = body[field] === null ? null : Number(body[field]);
            // Cap entry fee at MK5000
            if (field === "entry_fee" && numVal !== null && numVal > 5000) {
              return NextResponse.json({ error: "Entry fee cannot exceed MK 5,000" }, { status: 400 });
            }
            updates[field] = numVal;
          } else {
            updates[field] = body[field];
          }
        }
      }

      // Validate type and time_control against CHECK constraints
      if (updates.type && !["arena", "swiss", "knockout"].includes(updates.type)) {
        return NextResponse.json({ error: "Invalid tournament type" }, { status: 400 });
      }

      // Validate minimum players: at least 2, and never above the
      // effective max (updated value or the one already stored).
      if (updates.min_players !== undefined && updates.min_players !== null) {
        if (updates.min_players < 2) {
          return NextResponse.json({ error: "Minimum players must be at least 2" }, { status: 400 });
        }
        const effectiveMax = updates.max_players !== undefined ? updates.max_players : (tournament as any).max_players;
        if (effectiveMax != null && updates.min_players > effectiveMax) {
          return NextResponse.json({ error: "Minimum players cannot exceed max players" }, { status: 400 });
        }
      }
      if (updates.time_control && !["bullet", "blitz", "rapid", "classical"].includes(updates.time_control)) {
        return NextResponse.json({ error: "Invalid time control" }, { status: 400 });
      }

      // Changing type/time_control mid-tournament would corrupt already-created
      // pairings and in-progress games — only allow those two fields to change
      // while the tournament is still upcoming (no games exist yet).
      if (tournament.status === "active" && (updates.type || updates.time_control)) {
        return NextResponse.json({ error: "Cannot change type or time control on an active tournament" }, { status: 400 });
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
        .from("tournaments").select("status, max_players").eq("id", tournamentId).single();
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

      // ATOMIC GUARD: only reject if still pending_approval
      const { data: claimed, error: rejectErr } = await admin
        .from("tournaments")
        .update({ status: "rejected", ended_at: new Date().toISOString() })
        .eq("id", tournamentId)
        .eq("status", "pending_approval")
        .select("entry_fee");
      if (rejectErr) return NextResponse.json({ error: rejectErr.message }, { status: 500 });
      if (!claimed || claimed.length === 0) {
        return NextResponse.json({ error: "Tournament is no longer pending approval" }, { status: 400 });
      }

      // Refund any paid participants
      const entryFee = claimed[0].entry_fee || 0;
      if (entryFee > 0) {
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, paid_entry_fee")
          .eq("tournament_id", tournamentId)
          .eq("paid_entry_fee", true);

        for (const p of participants || []) {
          await admin.rpc("credit_wallet", { p_user_id: p.player_id, p_amount: entryFee });
          await admin.from("deposits").insert({
            user_id: p.player_id,
            amount: entryFee,
            status: "success",
            method: "tournament_refund",
            reference: `tournament_reject:${tournamentId}:${p.player_id}`,
          }).then(() => {}, () => {});
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
      // ATOMIC GUARD: only cancel if not already cancelled — prevents double-refund
      const { data: claimed, error: cancelErr } = await admin
        .from("tournaments")
        .update({ status: "cancelled", ended_at: new Date().toISOString() })
        .eq("id", tournamentId)
        .in("status", ["upcoming", "active"])
        .select("entry_fee");
      if (cancelErr) return NextResponse.json({ error: cancelErr.message }, { status: 500 });
      if (!claimed || claimed.length === 0) {
        return NextResponse.json({ error: "Tournament already cancelled or finished" }, { status: 400 });
      }

      const entryFee = claimed[0].entry_fee || 0;

      if (entryFee > 0) {
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, paid_entry_fee")
          .eq("tournament_id", tournamentId)
          .eq("paid_entry_fee", true);

        for (const p of participants || []) {
          await admin.rpc("credit_wallet", { p_user_id: p.player_id, p_amount: entryFee });
          await admin.from("deposits").insert({
            user_id: p.player_id,
            amount: entryFee,
            status: "success",
            method: "tournament_refund",
            reference: `tournament_cancel:${tournamentId}:${p.player_id}`,
          }).then(() => {}, () => {});
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
    // ATOMIC GUARD: atomically mark as cancelled first to prevent double-refund from concurrent cancel+delete
    if (tournament.entry_fee > 0 && (tournament.status === "upcoming" || tournament.status === "active")) {
      const { data: claimed } = await admin
        .from("tournaments")
        .update({ status: "cancelled", ended_at: new Date().toISOString() })
        .eq("id", tournamentId)
        .in("status", ["upcoming", "active"])
        .select("entry_fee");

      if (claimed && claimed.length > 0) {
        const entryFee = claimed[0].entry_fee || 0;
        if (entryFee > 0) {
          const { data: participants } = await admin
            .from("tournament_participants")
            .select("player_id, paid_entry_fee")
            .eq("tournament_id", tournamentId)
            .eq("paid_entry_fee", true);

          for (const p of participants || []) {
            await admin.rpc("credit_wallet", { p_user_id: p.player_id, p_amount: entryFee });
            await admin.from("deposits").insert({
              user_id: p.player_id,
              amount: entryFee,
              status: "success",
              method: "tournament_refund",
              reference: `tournament_delete:${tournamentId}:${p.player_id}`,
            }).then(() => {}, () => {});
          }
        }
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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeTournamentEconomics } from "@/lib/tournament/economics";

export const maxDuration = 60;

// GET — full tournament detail with participants + rounds (admin only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: tournamentId } = await params;

    // Fetch tournament
    const { data: tournament } = await admin
      .from("tournaments")
      .select("*")
      .eq("id", tournamentId)
      .single();
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    // Fetch participants with profiles
    const { data: participants } = await admin
      .from("tournament_participants")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("score", { ascending: false })
      .order("seed", { ascending: true });

    // Fetch profiles for participants
    const playerIds = (participants || []).map((p) => p.player_id);
    let profileMap: Record<string, any> = {};
    if (playerIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, rating")
        .in("id", playerIds);
      for (const p of profiles || []) {
        profileMap[p.id] = p;
      }
    }

    // Fetch rounds
    const { data: rounds } = await admin
      .from("tournament_rounds")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("round_number", { ascending: true });

    // Enrich round pairings with player names
    const enrichedRounds = (rounds || []).map((round) => {
      const pairings = (round.pairings as any[]) || [];
      const enrichedPairings = pairings.map((pair: any) => ({
        ...pair,
        whiteName: pair.white ? (profileMap[pair.white]?.display_name || profileMap[pair.white]?.username || "Unknown") : null,
        whiteRating: pair.white ? (profileMap[pair.white]?.rating || 0) : 0,
        blackName: pair.black ? (profileMap[pair.black]?.display_name || profileMap[pair.black]?.username || "Unknown") : null,
        blackRating: pair.black ? (profileMap[pair.black]?.rating || 0) : 0,
      }));
      return { ...round, pairings: enrichedPairings };
    });

    // Fetch creator profile
    let creator: any = null;
    if (tournament.created_by) {
      const { data: creatorProfile } = await admin
        .from("profiles")
        .select("username, display_name")
        .eq("id", tournament.created_by)
        .single();
      creator = creatorProfile;
    }

    // Calculate revenue breakdown (shared logic with finish.ts + public tournament page)
    const paidCount = (participants || []).filter(p => p.paid_entry_fee).length;
    const entryFee = tournament.entry_fee || 0;
    const paidTotal = paidCount * entryFee;
    const prizePool = tournament.prize_pool || 0;
    const creatorProfitPercent = tournament.creator_profit_percent || 0;
    const poolSource = tournament.pool_source || 'entry_fees';

    const economics = computeTournamentEconomics(tournament);
    const totalCollected = poolSource === 'fixed' ? paidTotal : economics.totalCollected;
    const actualPrizePool = economics.actualPrizePool;
    // For a fixed pool, the "platform revenue" is whatever was collected above the
    // fixed prize amount (a fixed pool has no percentage-based cut).
    const platformRevenue = poolSource === 'fixed'
      ? Math.max(0, paidTotal - prizePool)
      : economics.platformCut;
    const creatorProfit = poolSource === 'fixed' ? 0 : economics.creatorProfit;

    return NextResponse.json({
      success: true,
      tournament: { ...tournament, creator },
      participants: (participants || []).map((p) => ({
        ...p,
        profile: profileMap[p.player_id] || null,
      })),
      rounds: enrichedRounds,
      revenue: {
        entryFee,
        paidParticipants: paidCount,
        totalCollected,
        prizePool,
        actualPrizePool,
        platformRevenue,
        creatorProfit,
        poolSource,
        creatorProfitPercent,
      },
    });
  } catch (e: any) {
    console.error("Admin tournament detail error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// PATCH — admin lifecycle controls (start, advance_round, cancel, force_finish)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: tournamentId } = await params;
    const body = await req.json();
    const { action } = body;
    if (!action) return NextResponse.json({ error: "Action required" }, { status: 400 });

    // Fetch tournament
    const { data: tournament } = await admin
      .from("tournaments")
      .select("*")
      .eq("id", tournamentId)
      .single();
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    // ── START ──
    if (action === "start") {
      if (tournament.status !== "upcoming") {
        return NextResponse.json({ error: "Can only start upcoming tournaments" }, { status: 400 });
      }

      const minRequired = tournament.min_players || 2;
      const { data: participants } = await admin
        .from("tournament_participants")
        .select("player_id, score")
        .eq("tournament_id", tournamentId);
      if (!participants || participants.length < minRequired) {
        return NextResponse.json({ error: `Minimum ${minRequired} players required. Currently ${participants?.length || 0}.` }, { status: 400 });
      }

      // Fetch ratings for seeding
      const playerIds = participants.map((p) => p.player_id);
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, rating")
        .in("id", playerIds);
      const ratingMap = new Map((profiles || []).map((p) => [p.id, p.rating || 1200]));

      // Seed by rating
      const seeded = participants
        .map((p) => ({ ...p, rating: ratingMap.get(p.player_id) || 1200 }))
        .sort((a, b) => b.rating - a.rating);

      await Promise.all(
        seeded.map((s, i) =>
          admin.from("tournament_participants")
            .update({ seed: i + 1 })
            .eq("player_id", s.player_id)
            .eq("tournament_id", tournamentId)
        )
      );

      // Generate Round 1 Swiss pairings (fold method)
      const pairings: Array<{ white: string; black: string; bye?: string }> = [];
      if (seeded.length === 1) {
        pairings.push({ white: "", black: "", bye: seeded[0].player_id });
      } else {
        const mid = Math.ceil(seeded.length / 2);
        const topHalf = seeded.slice(0, mid);
        const bottomHalf = seeded.slice(mid);
        for (let i = 0; i < mid; i++) {
          if (i < bottomHalf.length) {
            const white = i % 2 === 0 ? topHalf[i].player_id : bottomHalf[i].player_id;
            const black = i % 2 === 0 ? bottomHalf[i].player_id : topHalf[i].player_id;
            pairings.push({ white, black });
          } else {
            pairings.push({ white: "", black: "", bye: topHalf[i].player_id });
          }
        }
      }

      // Create round entry
      await admin.from("tournament_rounds").insert({
        tournament_id: tournamentId,
        round_number: 1,
        pairings: pairings.map((p, i) => ({
          board: i + 1,
          white: p.white || null,
          black: p.black || null,
          bye: p.bye || null,
          result: null,
        })),
        is_complete: false,
      });

      // Create games
      const initialMs = (tournament.initial_minutes || 10) * 60 * 1000;
      const matchPairings = pairings.filter((p) => !p.bye);
      const byePairings = pairings.filter((p) => p.bye);

      if (matchPairings.length > 0) {
        const gameRows = matchPairings.map((pairing) => ({
          white_player_id: pairing.white,
          black_player_id: pairing.black,
          white_rating: ratingMap.get(pairing.white) || 1200,
          black_rating: ratingMap.get(pairing.black) || 1200,
          status: "playing",
          time_control: tournament.time_control,
          initial_minutes: tournament.initial_minutes,
          increment_seconds: tournament.increment_seconds,
          rated: false,
          tournament_id: tournamentId,
          tournament_round: 1,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_count: 0,
          white_clock_ms: initialMs,
          black_clock_ms: initialMs,
          last_move_at: new Date().toISOString(),
        }));
        await admin.from("games").insert(gameRows);
      }

      // Award byes
      for (const p of byePairings) {
        await admin.from("tournament_participants")
          .update({ wins: 1, score: 1, games_played: 1 })
          .eq("player_id", p.bye)
          .eq("tournament_id", tournamentId);
      }

      // Set active
      await admin.from("tournaments")
        .update({ status: "active", current_round: 1 })
        .eq("id", tournamentId);

      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id, action: "tournament_started",
          target_type: "tournament", target_id: tournamentId,
        });
      } catch {}
      return NextResponse.json({ success: true, message: "Tournament started", round: 1 });
    }

    // ── ADVANCE ROUND ──
    if (action === "advance_round") {
      if (tournament.status !== "active") {
        return NextResponse.json({ error: "Tournament not active" }, { status: 400 });
      }

      const nextRound = (tournament.current_round || 1) + 1;
      if (tournament.rounds && nextRound > tournament.rounds) {
        await admin.from("tournaments")
          .update({ status: "finished", ended_at: new Date().toISOString() })
          .eq("id", tournamentId);
        return NextResponse.json({ success: true, finished: true });
      }

      // Check current round complete
      const { data: currentRound } = await admin
        .from("tournament_rounds")
        .select("is_complete")
        .eq("tournament_id", tournamentId)
        .eq("round_number", tournament.current_round)
        .single();
      if (!currentRound?.is_complete) {
        return NextResponse.json({ error: "Current round not complete" }, { status: 400 });
      }

      // Fetch participants sorted by score
      const { data: participants } = await admin
        .from("tournament_participants")
        .select("player_id, score, seed, wins, losses, draws, games_played")
        .eq("tournament_id", tournamentId)
        .order("score", { ascending: false })
        .order("seed", { ascending: true });
      if (!participants || participants.length === 0) {
        return NextResponse.json({ error: "No participants" }, { status: 400 });
      }

      // Fetch profiles for ratings
      const playerIds = participants.map((p) => p.player_id);
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, rating")
        .in("id", playerIds);

      // Fetch previous matchups to avoid rematches
      const { data: previousGames } = await admin
        .from("games")
        .select("white_player_id, black_player_id")
        .eq("tournament_id", tournamentId);
      const previousMatchups = new Set<string>();
      for (const g of previousGames || []) {
        previousMatchups.add(`${g.white_player_id}|${g.black_player_id}`);
        previousMatchups.add(`${g.black_player_id}|${g.white_player_id}`);
      }

      // Swiss pairing
      const pairings: Array<{ white: string; black: string; bye?: string }> = [];
      const used = new Set<string>();
      const sorted = [...participants].sort((a, b) => (b.score || 0) - (a.score || 0) || (a.seed || 0) - (b.seed || 0));

      for (let i = 0; i < sorted.length; i++) {
        if (used.has(sorted[i].player_id)) continue;
        let paired = false;
        for (let j = i + 1; j < sorted.length; j++) {
          if (used.has(sorted[j].player_id)) continue;
          const key = `${sorted[i].player_id}|${sorted[j].player_id}`;
          if (previousMatchups.has(key)) continue;
          pairings.push({ white: sorted[i].player_id, black: sorted[j].player_id });
          used.add(sorted[i].player_id);
          used.add(sorted[j].player_id);
          paired = true;
          break;
        }
        if (!paired) {
          pairings.push({ white: "", black: "", bye: sorted[i].player_id });
          used.add(sorted[i].player_id);
        }
      }

      // Create round entry
      await admin.from("tournament_rounds").insert({
        tournament_id: tournamentId,
        round_number: nextRound,
        pairings: pairings.map((p, i) => ({
          board: i + 1,
          white: p.white || null,
          black: p.black || null,
          bye: p.bye || null,
          result: null,
        })),
        is_complete: false,
      });

      // Create games
      const initialMs = (tournament.initial_minutes || 10) * 60 * 1000;
      const matchPairings = pairings.filter((p) => !p.bye);
      const byePairings = pairings.filter((p) => p.bye);

      if (matchPairings.length > 0) {
        const gameRows = matchPairings.map((pairing) => ({
          white_player_id: pairing.white,
          black_player_id: pairing.black,
          white_rating: profiles?.find((p) => p.id === pairing.white)?.rating || 1200,
          black_rating: profiles?.find((p) => p.id === pairing.black)?.rating || 1200,
          status: "playing",
          time_control: tournament.time_control,
          initial_minutes: tournament.initial_minutes,
          increment_seconds: tournament.increment_seconds,
          rated: false,
          tournament_id: tournamentId,
          tournament_round: nextRound,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_count: 0,
          white_clock_ms: initialMs,
          black_clock_ms: initialMs,
          last_move_at: new Date().toISOString(),
        }));
        await admin.from("games").insert(gameRows);
      }

      // Award byes
      for (const p of byePairings) {
        const byeParticipant = participants.find((pp) => pp.player_id === p.bye);
        await admin.from("tournament_participants")
          .update({
            score: (byeParticipant?.score || 0) + 1,
            wins: (byeParticipant?.wins || 0) + 1,
            games_played: (byeParticipant?.games_played || 0) + 1,
          })
          .eq("player_id", p.bye)
          .eq("tournament_id", tournamentId);
      }

      await admin.from("tournaments")
        .update({ current_round: nextRound })
        .eq("id", tournamentId);

      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id, action: "tournament_advance_round",
          target_type: "tournament", target_id: tournamentId,
          details: { round: nextRound },
        });
      } catch {}
      return NextResponse.json({ success: true, round: nextRound });
    }

    // ── CANCEL ──
    if (action === "cancel") {
      if (!["upcoming", "active"].includes(tournament.status)) {
        return NextResponse.json({ error: "Can only cancel upcoming or active tournaments" }, { status: 400 });
      }

      await admin.from("tournaments")
        .update({ status: "cancelled", ended_at: new Date().toISOString() })
        .eq("id", tournamentId);

      // Refund paid participants
      const entryFee = tournament.entry_fee || 0;
      if (entryFee > 0) {
        const { data: paidParticipants } = await admin
          .from("tournament_participants")
          .select("player_id, paid_entry_fee")
          .eq("tournament_id", tournamentId)
          .eq("paid_entry_fee", true);
        for (const p of paidParticipants || []) {
          await admin.rpc("credit_wallet", { p_user_id: p.player_id, p_amount: entryFee });
        }
      }

      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id, action: "tournament_cancelled",
          target_type: "tournament", target_id: tournamentId,
        });
      } catch {}
      return NextResponse.json({ success: true });
    }

    // ── FORCE FINISH ──
    if (action === "force_finish") {
      if (tournament.status !== "active") {
        return NextResponse.json({ error: "Can only force finish active tournaments" }, { status: 400 });
      }

      await admin.from("tournaments")
        .update({ status: "finished", ended_at: new Date().toISOString() })
        .eq("id", tournamentId);

      // Rank participants by score
      const { data: participants } = await admin
        .from("tournament_participants")
        .select("id, score, wins")
        .eq("tournament_id", tournamentId)
        .order("score", { ascending: false })
        .order("wins", { ascending: false });

      if (participants && participants.length > 0) {
        for (let i = 0; i < participants.length; i++) {
          await admin.from("tournament_participants")
            .update({ final_rank: i + 1 })
            .eq("id", participants[i].id);
        }
      }

      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id, action: "tournament_force_finished",
          target_type: "tournament", target_id: tournamentId,
        });
      } catch {}
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("Admin tournament action error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

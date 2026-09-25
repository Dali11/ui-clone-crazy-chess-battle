import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeTournamentEconomics } from '@/lib/tournament/economics';
import { shouldShowPrizeDistribution } from '@/lib/tournament/prize-display';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    const resolvedParams = await params;
    const tournamentId = resolvedParams.id;

    let isAdmin = false;
    let profile: any = null;

    if (user) {
      const { data: profileData } = await admin
        .from('profiles')
        .select('id, username, display_name, avatar_url, rating, is_admin')
        .eq('id', user.id)
        .single();
      profile = profileData;
      isAdmin = !!profile?.is_admin;
    }

    // Fetch tournament
    const { data: tournament, error: tErr } = await admin
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (tErr || !tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // Fetch participants with profile data
    const { data: participants, error: pErr } = await admin
      .from('tournament_participants')
      .select(`
        player_id, seed, score, games_played, wins, losses, draws, streak, best_streak, final_rank, paid_entry_fee, joined_at,
        profile:profiles!tournament_participants_player_id_fkey(id, username, display_name, avatar_url, rating)
      `)
      .eq('tournament_id', tournamentId)
      .order('score', { ascending: false })
      .order('seed', { ascending: true });

    if (pErr) {
      console.error('Participants fetch error:', pErr);
    }

    // Check if current user is registered
    let isRegistered = false;
    if (user) {
      const { data: existing } = await admin
        .from('tournament_participants')
        .select('id, paid_entry_fee')
        .eq('tournament_id', tournamentId)
        .eq('player_id', user.id)
        .single();
      isRegistered = !!existing;
    }

    // Fetch rounds with pairings
    const { data: rounds, error: rErr } = await admin
      .from('tournament_rounds')
      .select('id, round_number, pairings, is_complete, created_at, starts_at')
      .eq('tournament_id', tournamentId)
      .order('round_number', { ascending: true });

    if (rErr) {
      console.error('Rounds fetch error:', rErr);
    }

    // Enrich pairings with player names
    const participantMap = new Map<string, any>();
    (participants || []).forEach((p: any) => {
      participantMap.set(p.player_id, p);
    });

    const enrichedRounds = (rounds || []).map((round: any) => {
      const pairings = (round.pairings || []).map((p: any) => {
        // Bye pairings store the advancing player's id in `p.bye`, with
        // `white`/`black` left as empty strings ("") — see
        // generateKnockoutBracket / advance-round's bye handling. Looking up
        // p.white for a bye always missed (participantMap has no "" key),
        // so every bye row rendered as "Unknown" even though the system
        // knew exactly who the bye player was (it's used correctly
        // elsewhere, e.g. tournaments/cron for bracket advancement).
        const whitePlayer = p.bye ? participantMap.get(p.bye) : participantMap.get(p.white);
        const blackPlayer = p.bye ? null : participantMap.get(p.black);
        return {
          ...p,
          whiteName: whitePlayer?.profile?.display_name || whitePlayer?.profile?.username || 'Unknown',
          whiteRating: whitePlayer?.profile?.rating || 0,
          blackName: blackPlayer?.profile?.display_name || blackPlayer?.profile?.username || 'Unknown',
          blackRating: blackPlayer?.profile?.rating || 0,
        };
      });
      return {
        ...round,
        pairings,
      };
    });

    // Attach game_id to each pairing by matching white/black player IDs
    // with games created for this tournament. Without this, the client
    // can never auto-redirect players to their game board.
    const { data: tournamentGames } = await admin
      .from("games")
      .select("id, white_player_id, black_player_id, tournament_round, status")
      .eq("tournament_id", tournamentId)
      .in("status", ["waiting", "playing"]);

    // Build a lookup: "whiteId|blackId|round" → gameId
    const gameLookup = new Map<string, string>();
    for (const g of tournamentGames || []) {
      gameLookup.set(`${g.white_player_id}|${g.black_player_id}|${g.tournament_round}`, g.id);
      gameLookup.set(`${g.black_player_id}|${g.white_player_id}|${g.tournament_round}`, g.id);
    }

    // Attach game_id to each enriched round pairing
    const roundsWithGameIds = enrichedRounds.map((round: any) => {
      const roundNumber = round.round_number;
      const pairings = (round.pairings || []).map((p: any) => {
        const gameId = gameLookup.get(`${p.white}|${p.black}|${roundNumber}`);
        return { ...p, game_id: gameId || undefined };
      });
      return { ...round, pairings };
    });

    // Can join?
    let canJoin = false;
    let joinReason = null;

    if (tournament.status !== 'upcoming' && tournament.status !== 'active') {
      canJoin = false;
      joinReason = tournament.status === 'completed' ? 'completed' : 'not_joinable';
    } else if (!user) {
      canJoin = false;
      joinReason = 'not_authenticated';
    } else if (isRegistered) {
      canJoin = false;
      joinReason = 'already_registered';
    } else if (tournament.status === 'active' && tournament.type === 'knockout') {
      // Bracket fixed at start — late joiners can never be paired
      canJoin = false;
      joinReason = 'already_started';
    } else if (tournament.max_players && (participants?.length || 0) >= tournament.max_players) {
      canJoin = false;
      joinReason = 'full';
    } else if (tournament.min_rating && profile?.rating < tournament.min_rating) {
      canJoin = false;
      joinReason = 'rating_too_low';
    } else if (tournament.max_rating && profile?.rating > tournament.max_rating) {
      canJoin = false;
      joinReason = 'rating_too_high';
    } else {
      canJoin = true;
    }

    // The gross `prize_pool` collected from entry fees isn't what actually gets
    // paid to winners — the platform takes a cut, and if the creator set a
    // profit percentage, they take a cut of the remainder too. Surface the real
    // payout amount so players see accurate numbers, not the inflated gross total.
    const { actualPrizePool } = computeTournamentEconomics(tournament);

    // For arena tournaments, fetch live games + recent finished games
    let arenaGames: any[] = [];
    let arenaRecentResults: any[] = [];
    if (tournament.type === "arena") {
      const { data: aGames } = await admin
        .from("games")
        .select(`
          id, status, tournament_round, white_player_id, black_player_id,
          white_clock_ms, black_clock_ms, turn,
          white_rating, black_rating
        `)
        .eq("tournament_id", tournamentId)
        .in("status", ["waiting", "playing"])
        .order("created_at", { ascending: false });

      arenaGames = (aGames || []).map((g: any) => {
        const whiteP = participantMap.get(g.white_player_id);
        const blackP = participantMap.get(g.black_player_id);
        return {
          id: g.id,
          status: g.status,
          round: g.tournament_round,
          whiteId: g.white_player_id,
          blackId: g.black_player_id,
          whiteName: whiteP?.profile?.display_name || whiteP?.profile?.username || "Unknown",
          whiteRating: g.white_rating || whiteP?.profile?.rating || 0,
          whiteAvatar: whiteP?.profile?.avatar_url || null,
          blackName: blackP?.profile?.display_name || blackP?.profile?.username || "Unknown",
          blackRating: g.black_rating || blackP?.profile?.rating || 0,
          blackAvatar: blackP?.profile?.avatar_url || null,
        };
      });
    }

    // Fetch recent finished arena games (last 5) for the "Recent Results" strip
    if (tournament.type === "arena") {
      const { data: finishedGames } = await admin
        .from("games")
        .select("id, status, winner, white_player_id, black_player_id")
        .eq("tournament_id", tournamentId)
        .in("status", ["timeout", "resigned", "draw", "stalemate", "abort"])
        .order("updated_at", { ascending: false })
        .limit(5);

      arenaRecentResults = (finishedGames || []).map((g: any) => {
        const whiteP = participantMap.get(g.white_player_id);
        const blackP = participantMap.get(g.black_player_id);
        const result: 'white' | 'black' | 'draw' =
          g.winner === 'white' ? 'white' :
          g.winner === 'black' ? 'black' : 'draw';
        return {
          id: g.id,
          whiteId: g.white_player_id,
          blackId: g.black_player_id,
          whiteName: whiteP?.profile?.display_name || whiteP?.profile?.username || "Unknown",
          blackName: blackP?.profile?.display_name || blackP?.profile?.username || "Unknown",
          result,
        };
      });
    }

    // Registered-player roster and count are hidden until it's time to
    // start (owner decision 2026-09-25). Admins always see real data.
    // isRegistered/canJoin were computed above from the full data, so
    // hiding here does not affect join logic.
    // Owner rule (2026-09-25): the tournament CREATOR can also see the
    // real roster/standings pre-start, same as admins — only other
    // players see it hidden until the tournament actually starts.
    const isCreator = !!user && tournament.created_by === user.id;
    const started =
      ["active", "completed", "finished"].includes(tournament.status) ||
      (tournament.starts_at ? new Date(tournament.starts_at).getTime() <= Date.now() : false);
    const hideRoster = !started && !isAdmin && !isCreator;

    // Owner rule (2026-09-25): the prize distribution card stays hidden
    // until the number-5 payout exceeds the entry price. Strip it from
    // the payload for non-admins while the pool is still too small;
    // admins keep it for the edit panel.
    const showPrizeDist =
      isAdmin ||
      shouldShowPrizeDistribution(
        tournament.prize_distribution,
        actualPrizePool,
        tournament.entry_fee || 0
      );

    return NextResponse.json({
      success: true,
      isAdmin,
      isCreator,
      isRegistered,
      currentPlayerId: user?.id || null,
      canJoin,
      joinReason,
      tournament: {
        ...tournament,
        actual_prize_pool: actualPrizePool,
        prize_distribution: showPrizeDist ? tournament.prize_distribution : null,
      },
      participants: hideRoster ? [] : (participants || []),
      rounds: hideRoster ? [] : roundsWithGameIds,
      participantCount: hideRoster ? null : (participants?.length || 0),
      arenaGames,
      arenaRecentResults,
    });
  } catch (error: any) {
    console.error('Tournament detail API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
      .select('id, round_number, pairings, is_complete, created_at')
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
        const whitePlayer = participantMap.get(p.white);
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

    // Can join?
    let canJoin = false;
    let joinReason = null;

    if (tournament.status !== 'upcoming') {
      canJoin = false;
      joinReason = tournament.status === 'active' ? 'already_started' : tournament.status === 'completed' ? 'completed' : 'not_joinable';
    } else if (!user) {
      canJoin = false;
      joinReason = 'not_authenticated';
    } else if (isRegistered) {
      canJoin = false;
      joinReason = 'already_registered';
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

    return NextResponse.json({
      success: true,
      isAdmin,
      isRegistered,
      canJoin,
      joinReason,
      tournament,
      participants: participants || [],
      rounds: enrichedRounds,
      participantCount: participants?.length || 0,
    });
  } catch (error: any) {
    console.error('Tournament detail API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

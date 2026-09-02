import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// Types
// ============================================================

export interface LeagueFixture {
  id: string;
  league_id: string;
  matchday: number;
  home_player_id: string;
  away_player_id: string;
  result: string;
  played: boolean;
  scheduled_date: string | null;
}

export interface LeagueStanding {
  id: string;
  league_id: string;
  player_id: string;
  position: number;
  previous_position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  form: string[];
}

export interface PlayerInfo {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  country: string | null;
  rating: number;
}

export interface EnrichedFixture extends LeagueFixture {
  home_player: PlayerInfo | null;
  away_player: PlayerInfo | null;
}

export interface EnrichedStanding extends LeagueStanding {
  player: PlayerInfo | null;
}

// ============================================================
// Helpers
// ============================================================

async function getPlayerInfo(supabase: SupabaseClient, playerId: string): Promise<PlayerInfo | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, country, rating')
    .eq('id', playerId)
    .single();
  return data as PlayerInfo | null;
}

async function getPlayers(supabase: SupabaseClient, playerIds: string[]): Promise<Map<string, PlayerInfo>> {
  if (playerIds.length === 0) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, country, rating')
    .in('id', playerIds);
  const map = new Map<string, PlayerInfo>();
  (data || []).forEach((p: any) => map.set(p.id, p));
  return map;
}

// ============================================================
// Round Robin Generation
// ============================================================

export function generateRoundRobin(
  playerIds: string[],
  doubleRoundRobin: boolean = false
): { matchday: number; home_player_id: string; away_player_id: string }[] {
  if (doubleRoundRobin) {
    return generateDoubleRoundRobin(playerIds);
  }
  const n = playerIds.length;
  if (n < 2) return [];
  const players = [...playerIds];
  if (n % 2 !== 0) players.push('__BYE__');
  const totalRounds = players.length - 1;
  const half = players.length / 2;
  const fixtures: { matchday: number; home_player_id: string; away_player_id: string }[] = [];
  const arr = [...players];
  for (let round = 0; round < totalRounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = arr[i], away = arr[players.length - 1 - i];
      if (home === '__BYE__' || away === '__BYE__') continue;
      let hp: string, ap: string;
      if (round % 2 === 0) { hp = home; ap = away; } else { hp = away; ap = home; }
      fixtures.push({ matchday: round + 1, home_player_id: hp, away_player_id: ap });
    }
    const last = arr.pop()!;
    arr.splice(1, 0, last);
  }
  return fixtures;
}

export function generateDoubleRoundRobin(
  playerIds: string[]
): { matchday: number; home_player_id: string; away_player_id: string }[] {
  const firstLeg = generateRoundRobin(playerIds, false);
  if (firstLeg.length === 0) return [];

  const n = playerIds.length;
  const totalRounds = n % 2 === 0 ? n - 1 : n;

  const secondLeg = firstLeg.map((f) => ({
    matchday: f.matchday + totalRounds,
    home_player_id: f.away_player_id,
    away_player_id: f.home_player_id,
  }));

  return [...firstLeg, ...secondLeg];
}

// ============================================================
// Standings Calculation
// ============================================================

function calcStandings(
  playerIds: string[],
  fixtures: LeagueFixture[],
  scoringConfig: { winPoints: number; drawPoints: number; lossPoints: number }
): Map<string, any> {
  const standings = new Map<string, any>();
  const formMap = new Map<string, string[]>();
  for (const pid of playerIds) {
    standings.set(pid, { player_id: pid, position: 0, previous_position: 0, played: 0, wins: 0, draws: 0, losses: 0, points: 0, form: [] });
    formMap.set(pid, []);
  }
  for (const f of fixtures.filter(f => f.played).sort((a, b) => a.matchday - b.matchday)) {
    const hs = standings.get(f.home_player_id), as = standings.get(f.away_player_id);
    if (!hs || !as) continue;
    hs.played++; as.played++;
    if (f.result === 'home_win') {
      hs.wins++; hs.points += scoringConfig.winPoints; as.losses++; as.points += scoringConfig.lossPoints;
      formMap.get(f.home_player_id)!.push('W'); formMap.get(f.away_player_id)!.push('L');
    } else if (f.result === 'away_win') {
      as.wins++; as.points += scoringConfig.winPoints; hs.losses++; hs.points += scoringConfig.lossPoints;
      formMap.get(f.away_player_id)!.push('W'); formMap.get(f.home_player_id)!.push('L');
    } else if (f.result === 'draw') {
      hs.draws++; hs.points += scoringConfig.drawPoints; as.draws++; as.points += scoringConfig.drawPoints;
      formMap.get(f.home_player_id)!.push('D'); formMap.get(f.away_player_id)!.push('D');
    } else if (f.result === 'double_forfeit') {
      // Both players played a game but neither gets points — non-appearance penalty
      hs.played--; as.played--; // undo the played++ since double_forfeit shouldn't count as a game played
      formMap.get(f.home_player_id)!.push('F'); formMap.get(f.away_player_id)!.push('F');
    }
  }
  for (const [pid, form] of formMap.entries()) {
    const st = standings.get(pid);
    if (st) st.form = form.slice(-5);
  }
  return standings;
}

function sortAndRank(
  standings: Map<string, any>,
  fixtures: LeagueFixture[],
  scoringConfig: { winPoints: number; drawPoints: number; lossPoints: number }
): any[] {
  const sorted = Array.from(standings.values());
  sorted.sort((a, b) => {
    // 1. Points (descending)
    if (b.points !== a.points) return b.points - a.points;

    // 2. Head-to-head — primary tiebreaker when points are equal
    //    Uses the league's actual scoring config, not hardcoded values
    const h2h = fixtures.filter(f => f.played && (
      (f.home_player_id === a.player_id && f.away_player_id === b.player_id) ||
      (f.home_player_id === b.player_id && f.away_player_id === a.player_id)
    ));
    let aS = 0, bS = 0;
    for (const f of h2h) {
      if (f.result === 'home_win') {
        if (f.home_player_id === a.player_id) { aS += scoringConfig.winPoints; bS += scoringConfig.lossPoints; }
        else { bS += scoringConfig.winPoints; aS += scoringConfig.lossPoints; }
      } else if (f.result === 'away_win') {
        if (f.away_player_id === a.player_id) { aS += scoringConfig.winPoints; bS += scoringConfig.lossPoints; }
        else { bS += scoringConfig.winPoints; aS += scoringConfig.lossPoints; }
      } else if (f.result === 'draw') {
        aS += scoringConfig.drawPoints; bS += scoringConfig.drawPoints;
      }
      // double_forfeit: no points to either side — correct
    }
    if (aS !== bS) return bS - aS;

    // 3. Wins (descending)
    if (b.wins !== a.wins) return b.wins - a.wins;

    // 4. Goal difference = wins - losses (descending)
    const aGD = a.wins - a.losses, bGD = b.wins - b.losses;
    if (bGD !== aGD) return bGD - aGD;

    // 5. Player ID (alphabetical — deterministic final tiebreaker)
    return a.player_id.localeCompare(b.player_id);
  });
  sorted.forEach((s, i) => { s.position = i + 1; });
  return sorted;
}

// ============================================================
// Recalculate & Save Standings
// ============================================================

export async function recalcStandings(supabase: SupabaseClient, leagueId: string): Promise<any[]> {
  const { data: league } = await supabase.from('premier_leagues').select('*').eq('id', leagueId).single();
  if (!league) return [];
  const sc = league.scoring_config || { winPoints: 3, drawPoints: 1, lossPoints: 0 };
  const playerIds: string[] = league.player_ids || [];
  const { data: allFixtures } = await supabase.from('league_fixtures').select('*').eq('league_id', leagueId);
  const fixtures = (allFixtures || []) as unknown as LeagueFixture[];
  const { data: prevStandings } = await supabase.from('league_standings').select('*').eq('league_id', leagueId);
  const prevPositions = new Map<string, number>();
  (prevStandings || []).forEach((ps: any) => prevPositions.set(ps.player_id, ps.position || 0));
  const standings = calcStandings(playerIds, fixtures, sc);
  const sorted = sortAndRank(standings, fixtures, sc);
  for (const st of sorted) {
    st.league_id = leagueId;
    st.previous_position = prevPositions.get(st.player_id) || 0;
    const existing = (prevStandings || []).find((ps: any) => ps.player_id === st.player_id);
    if (existing) {
      await supabase.from('league_standings').update({
        position: st.position, previous_position: st.previous_position, played: st.played,
        wins: st.wins, draws: st.draws, losses: st.losses, points: st.points, form: st.form,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('league_standings').insert({
        league_id: leagueId, player_id: st.player_id, position: st.position,
        previous_position: st.previous_position, played: st.played, wins: st.wins,
        draws: st.draws, losses: st.losses, points: st.points, form: st.form,
      });
    }
  }
  return sorted;
}

// ============================================================
// Streak Helper
// ============================================================

export function getStreak(form: string[]): { type: string; count: number } {
  if (!form || form.length === 0) return { type: 'none', count: 0 };
  const last = form[form.length - 1];
  let count = 0;
  for (let i = form.length - 1; i >= 0; i--) { if (form[i] === last) count++; else break; }
  const typeMap: Record<string, string> = { W: 'wins', L: 'losses', D: 'draws' };
  return { type: typeMap[last] || 'none', count };
}

// ============================================================
// H2H Record
// ============================================================

export async function getH2H(supabase: SupabaseClient, p1: string, p2: string): Promise<any> {
  const { data: fixtures } = await supabase.from('league_fixtures').select('*').or(`and(home_player_id.eq.${p1},away_player_id.eq.${p2}),and(home_player_id.eq.${p2},away_player_id.eq.${p1})`);
  const meetings = (fixtures || []).filter((f: any) => f.played);
  let p1Wins = 0, p2Wins = 0, draws = 0;
  for (const m of meetings) {
    if (m.result === 'home_win') { if (m.home_player_id === p1) p1Wins++; else p2Wins++; }
    else if (m.result === 'away_win') { if (m.away_player_id === p1) p1Wins++; else p2Wins++; }
    else if (m.result === 'draw') draws++;
  }
  return { total: p1Wins + p2Wins + draws, p1Wins, p2Wins, draws };
}

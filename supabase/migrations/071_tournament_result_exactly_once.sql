-- 071: Exactly-once tournament result processing.
--
-- BUG (found 2026-09-13, live swiss tournament "Kenya Ultimate Showdown"):
-- _processTournamentGameResult updated participant stats with a read-then-write
-- (`score = stats.score + 1`) and rewrote the round's pairings JSON with a
-- read-modify-write of the whole array. Every player's browser heartbeat, the
-- opponent's timeout-check poll, and the cron sweeps can all trigger it
-- CONCURRENTLY for different games in the same round. Two processors for
-- different games both read pairings (results null), then each writes its own
-- version — the later write silently ERASES the earlier game's result.
-- The reconciliation sweep then sees the erased result as "stranded",
-- reprocesses the game, and the stats increment a SECOND time.
-- Observed: 3 games double-processed, 6 players with inflated score/games
-- (e.g. "3 played in 2 rounds" on the standings page).
--
-- FIX: single SQL RPC, atomic in one transaction:
--   1. claim: insert into tournament_game_results (game_id PK) — ON CONFLICT
--      DO NOTHING. Only the FIRST caller proceeds to stats.
--   2. stats: column-arithmetic increments (score = score + 1), no
--      read-then-write, so a lost-update can never inflate or deflate.
--   3. pairing result: per-board jsonb update (no whole-array rewrite), done
--      on EVERY call (idempotent) so a clobbered pairing gets repaired without
--      re-touching stats.
-- Also: credit_tournament_bye for the bye-credit call sites (same
-- read-then-write race), and recompute_tournament_stats to repair corrupted
-- standings from the pairings ground truth.

create table if not exists tournament_game_results (
  game_id uuid primary key references games(id) on delete cascade,
  tournament_id uuid not null,
  round_number integer,
  result text not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_tournament_game_results_tournament
  on tournament_game_results (tournament_id);

-- Atomic stats-only apply (used by process_tournament_result AND by
-- recordManualTournamentResult's direct-record path where there is no game row
-- to claim on).
create or replace function apply_tournament_stats(
  p_tournament_id uuid,
  p_white_id uuid,
  p_black_id uuid,
  p_result text
) returns void
language sql as $$
  update tournament_participants
  set score = score + 0.5, draws = draws + 1, games_played = games_played + 1
  where tournament_id = p_tournament_id and p_result = 'draw'
    and player_id in (p_white_id, p_black_id);

  update tournament_participants
  set score = score + 1, wins = wins + 1, games_played = games_played + 1
  where tournament_id = p_tournament_id and p_result = 'white'
    and player_id = p_white_id;

  update tournament_participants
  set losses = losses + 1, games_played = games_played + 1
  where tournament_id = p_tournament_id and p_result = 'white'
    and player_id = p_black_id;

  update tournament_participants
  set score = score + 1, wins = wins + 1, games_played = games_played + 1
  where tournament_id = p_tournament_id and p_result = 'black'
    and player_id = p_black_id;

  update tournament_participants
  set losses = losses + 1, games_played = games_played + 1
  where tournament_id = p_tournament_id and p_result = 'black'
    and player_id = p_white_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- process_tournament_result
-- Returns jsonb: { first_time: bool, pairing_found: bool, round_complete: bool | null }
--  - first_time:     true only for the call that won the claim (stats applied)
--  - pairing_found:  false = no board in the round matched this game
--  - round_complete: is_complete AFTER this write (null when round not found)
-- p_keep_open: knockout draws leave the round open (Armageddon tiebreak pending).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function process_tournament_result(
  p_game_id uuid,
  p_tournament_id uuid,
  p_round_number integer,
  p_white_id uuid,
  p_black_id uuid,
  p_result text,
  p_keep_open boolean default false
) returns jsonb
language plpgsql as $$
declare
  v_first boolean;
  v_round record;
  v_new_pairings jsonb;
  v_pairing_found boolean := false;
  v_complete boolean;
begin
  -- 1. Exactly-once claim
  insert into tournament_game_results (game_id, tournament_id, round_number, result)
  values (p_game_id, p_tournament_id, p_round_number, p_result)
  on conflict (game_id) do nothing;
  v_first := found;

  -- 2. Stats — atomic increments, first processing only
  if v_first then
    perform apply_tournament_stats(p_tournament_id, p_white_id, p_black_id, p_result);
  end if;

  -- 3. Pairing result — per-board update, idempotent, runs on every call
  select id, pairings into v_round
  from tournament_rounds
  where tournament_id = p_tournament_id and round_number = p_round_number;

  if v_round.id is null then
    return jsonb_build_object('first_time', v_first, 'pairing_found', false, 'round_complete', null);
  end if;

  -- 3a. match by game_id (normal case)
  select jsonb_agg(
      case when elem->>'game_id' = p_game_id::text
           then jsonb_set(elem, '{result}', to_jsonb(p_result))
           else elem end
      order by ord)
  into v_new_pairings
  from jsonb_array_elements(v_round.pairings) with ordinality as x(elem, ord);

  if v_new_pairings is distinct from v_round.pairings then
    v_pairing_found := true;
  else
    -- 3b. fallback: match by player pair (rounds created before game_id backfill)
    select jsonb_agg(
        case when (elem->>'white' = p_white_id::text and elem->>'black' = p_black_id::text)
               or (elem->>'white' = p_black_id::text and elem->>'black' = p_white_id::text)
             then jsonb_set(elem, '{result}', to_jsonb(p_result))
             else elem end
        order by ord)
    into v_new_pairings
    from jsonb_array_elements(v_round.pairings) with ordinality as x(elem, ord);
    v_pairing_found := v_new_pairings is distinct from v_round.pairings;
  end if;

  if v_new_pairings is null then
    v_new_pairings := v_round.pairings;
  end if;

  -- 4. Round completion
  select bool_and(
      coalesce(elem->>'result' is not null, false)
      or coalesce(elem->>'bye' is not null, false)
      or coalesce((elem->>'is_third_place')::boolean, false))
  into v_complete
  from jsonb_array_elements(v_new_pairings) as x(elem);

  v_complete := coalesce(v_complete, true) and not p_keep_open;

  update tournament_rounds
  set pairings = v_new_pairings, is_complete = v_complete
  where id = v_round.id;

  return jsonb_build_object(
    'first_time', v_first,
    'pairing_found', v_pairing_found,
    'round_complete', v_complete);
end;
$$;

-- Atomic bye credit (replaces read-then-write `score: x.score + 1` call sites)
create or replace function credit_tournament_bye(
  p_tournament_id uuid,
  p_player_id uuid
) returns void
language sql as $$
  update tournament_participants
  set score = score + 1, wins = wins + 1, games_played = games_played + 1
  where tournament_id = p_tournament_id and player_id = p_player_id;
$$;

-- Repair: recompute every participant's score/wins/losses/draws/games_played
-- from the tournament_rounds pairings ground truth (byes included).
-- ARENA tournaments have no rounds/pairings — refused rather than zeroed.
-- Returns the number of participant rows updated.
create or replace function recompute_tournament_stats(
  p_tournament_id uuid
) returns integer
language plpgsql as $$
declare
  v_type text;
  v_updated integer;
  v_zeroed integer;
begin
  select type into v_type from tournaments where id = p_tournament_id;
  if v_type = 'arena' then
    raise exception 'recompute_tournament_stats: arena tournaments have no round pairings';
  end if;

  drop table if exists tmp_expected_stats;
  create temp table tmp_expected_stats on commit drop as
    select player_id,
           sum(pts)::real as score,
           count(*) filter (where res = 'win')::int  as wins,
           count(*) filter (where res = 'loss')::int as losses,
           count(*) filter (where res = 'draw')::int as draws,
           count(*)::int as games_played
    from (
      -- byes: 1 point, 1 win, 1 game
      select pr->>'bye' as player_id, 'win'::text as res, 1.0::real as pts
      from tournament_rounds r, jsonb_array_elements(r.pairings) pr
      where r.tournament_id = p_tournament_id and pr->>'bye' is not null
      union all
      -- decisive/draw results: one row per PLAYER
      select pr->>'white' as player_id,
             case pr->>'result' when 'white' then 'win' when 'black' then 'loss' else 'draw' end,
             case pr->>'result' when 'white' then 1.0::real when 'black' then 0.0::real else 0.5::real end
      from tournament_rounds r, jsonb_array_elements(r.pairings) pr
      where r.tournament_id = p_tournament_id
        and pr->>'result' is not null
        and pr->>'white' is not null and pr->>'black' is not null
      union all
      select pr->>'black' as player_id,
             case pr->>'result' when 'black' then 'win' when 'white' then 'loss' else 'draw' end,
             case pr->>'result' when 'black' then 1.0::real when 'white' then 0.0::real else 0.5::real end
      from tournament_rounds r, jsonb_array_elements(r.pairings) pr
      where r.tournament_id = p_tournament_id
        and pr->>'result' is not null
        and pr->>'white' is not null and pr->>'black' is not null
    ) games
    group by player_id;

  -- players with expected stats: set them
  update tournament_participants p
  set score = e.score,
      wins = e.wins,
      losses = e.losses,
      draws = e.draws,
      games_played = e.games_played
  from tmp_expected_stats e
  where p.tournament_id = p_tournament_id
    and p.player_id = e.player_id
    and (p.score <> e.score or p.wins <> e.wins or p.losses <> e.losses
         or p.draws <> e.draws or p.games_played <> e.games_played);

  get diagnostics v_updated = row_count;

  -- players with NO games in any pairing (late joiners never paired): zero out
  update tournament_participants p
  set score = 0, wins = 0, losses = 0, draws = 0, games_played = 0
  where p.tournament_id = p_tournament_id
    and not exists (select 1 from tmp_expected_stats e where e.player_id = p.player_id)
    and (p.score <> 0 or p.wins <> 0 or p.losses <> 0 or p.draws <> 0 or p.games_played <> 0);

  get diagnostics v_zeroed = row_count;
  return v_updated + v_zeroed;
end;
$$;

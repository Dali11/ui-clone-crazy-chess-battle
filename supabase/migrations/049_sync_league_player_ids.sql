-- Migration 049: Sync league player_ids from registrations
-- Fixes race condition where concurrent joins overwrote player_ids array

-- Function to rebuild player_ids from league_registrations (source of truth)
CREATE OR REPLACE FUNCTION sync_league_player_ids()
RETURNS void AS $$
BEGIN
  UPDATE premier_leagues pl
  SET player_ids = (
    SELECT array_agg(lr.player_id)
    FROM league_registrations lr
    WHERE lr.league_id = pl.id
    AND lr.status IN ('pending', 'approved')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic append function (prevents race condition on concurrent joins)
CREATE OR REPLACE FUNCTION atomic_join_league(p_league_id uuid, p_player_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE premier_leagues
  SET player_ids = array_append(COALESCE(player_ids, ARRAY[]::uuid[]), p_player_id),
      updated_at = now()
  WHERE id = p_league_id
  AND NOT (p_player_id = ANY(COALESCE(player_ids, ARRAY[]::uuid[])));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run sync once to fix any existing mismatch
SELECT sync_league_player_ids();

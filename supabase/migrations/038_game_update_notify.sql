-- Migration 038: Server-side notification for game updates
-- This creates a PostgreSQL trigger that broadcasts game updates via
-- Supabase's pg_notify mechanism. Even if the client's realtime channel
-- is temporarily down, the postgres_changes event will fire when the
-- channel reconnects, ensuring the opponent always receives the update.
--
-- The trigger is lightweight — it only fires on UPDATE to the games table
-- and only when move_count or status changes, avoiding redundant notifications
-- for clock-only updates.

-- 1. Function to notify on game updates
CREATE OR REPLACE FUNCTION notify_game_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify if move_count or status changed (skip clock-only updates)
  IF NEW.move_count IS DISTINCT FROM OLD.move_count
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    -- The payload includes just enough for the client to identify the change
    -- Full state is fetched via the /api/game/state polling endpoint
    PERFORM pg_notify(
      'game_update',
      json_build_object(
        'id', NEW.id,
        'move_count', NEW.move_count,
        'status', NEW.status,
        'turn', NEW.turn,
        'fen', NEW.fen
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS trigger_game_update ON games;
CREATE TRIGGER trigger_game_update
  AFTER UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION notify_game_update();

-- 3. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;

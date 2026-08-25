-- Add variant column to draughts tables
ALTER TABLE public.draughts_games ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'international';
ALTER TABLE public.draughts_challenges ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'international';
ALTER TABLE public.draughts_matchmaking_queue ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'international';

-- Update create_draughts_game RPC to accept variant param
CREATE OR REPLACE FUNCTION public.create_draughts_game(
  p_white_id UUID, p_black_id UUID, p_white_rating INT, p_black_rating INT,
  p_time_control TEXT, p_initial_minutes INT, p_increment_seconds INT,
  p_rated BOOLEAN, p_variant TEXT DEFAULT 'international'
) RETURNS UUID AS $func$
DECLARE
  game_id UUID;
  initial_ms INT;
  initial_board TEXT;
BEGIN
  initial_ms := p_initial_minutes * 60 * 1000;
  initial_board := E'.b.b.b.b\nb.b.b.b.\n.b.b.b.b\n........\n........\nw.w.w.w.\n.w.w.w.w\nw.w.w.w.';
  INSERT INTO public.draughts_games (
    white_player_id, black_player_id, white_rating, black_rating,
    time_control, initial_minutes, increment_seconds, rated, variant,
    status, board_state, turn, move_count, white_clock_ms, black_clock_ms, last_move_at
  ) VALUES (
    p_white_id, p_black_id, p_white_rating, p_black_rating,
    p_time_control, p_initial_minutes, p_increment_seconds, p_rated, p_variant,
    'playing', initial_board, 'white', 0, initial_ms, initial_ms, now()
  ) RETURNING id INTO game_id;
  RETURN game_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

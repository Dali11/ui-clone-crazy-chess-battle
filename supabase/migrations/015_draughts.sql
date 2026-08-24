-- ============================================================
-- DRAUGHTS GAMES TABLE
-- Separate from chess games — different board representation
-- ============================================================

CREATE TABLE IF NOT EXISTS public.draughts_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  white_player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  black_player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  white_rating INT,
  black_rating INT,
  white_rating_change INT,
  black_rating_change INT,

  -- Time control (simpler for draughts MVP — just minutes + increment)
  time_control TEXT NOT NULL DEFAULT 'blitz' CHECK (time_control IN ('bullet', 'blitz', 'rapid')),
  initial_minutes INT NOT NULL DEFAULT 5,
  increment_seconds INT NOT NULL DEFAULT 0,

  -- Game state
  status TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'win', 'resign', 'timeout', 'draw', 'abort')),
  winner TEXT CHECK (winner IN ('white', 'black', NULL)),

  -- Board state stored as JSON string (8x8 grid)
  board_state TEXT NOT NULL,
  move_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  move_count INT NOT NULL DEFAULT 0,
  turn TEXT NOT NULL DEFAULT 'white' CHECK (turn IN ('white', 'black')),

  -- No-capture counter for draw detection (40-move rule)
  moves_since_capture INT NOT NULL DEFAULT 0,

  -- Multi-jump state: if a piece must continue jumping, store its position
  must_continue_jump JSONB,

  -- Clocks
  white_clock_ms INT NOT NULL,
  black_clock_ms INT NOT NULL,
  last_move_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Meta
  rated BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_draughts_white_player ON public.draughts_games(white_player_id);
CREATE INDEX IF NOT EXISTS idx_draughts_black_player ON public.draughts_games(black_player_id);
CREATE INDEX IF NOT EXISTS idx_draughts_status ON public.draughts_games(status);
CREATE INDEX IF NOT EXISTS idx_draughts_created_at ON public.draughts_games(created_at DESC);

-- ============================================================
-- CREATE_DRAUGHTS_GAME RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_draughts_game(
  p_white_id UUID,
  p_black_id UUID,
  p_white_rating INT,
  p_black_rating INT,
  p_time_control TEXT,
  p_initial_minutes INT,
  p_increment_seconds INT,
  p_rated BOOLEAN
) RETURNS UUID AS $$
DECLARE
  game_id UUID;
  initial_ms INT;
  initial_board TEXT;
BEGIN
  initial_ms := p_initial_minutes * 60 * 1000;
  -- Initial board as flat array: null=empty/light, 'w'=white man, 'b'=black man
  -- Row 0-2: black pieces, Row 5-7: white pieces
  initial_board := '[null,"b",null,"b",null,"b",null,"b",null,"b",null,"b",null,"b",null,"b",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"w",null,"w",null,"w",null,"w",null,"w",null,"w",null,"w",null,"w",null,"w"]';

  INSERT INTO public.draughts_games (
    white_player_id, black_player_id,
    white_rating, black_rating,
    time_control, initial_minutes, increment_seconds,
    rated, status, board_state, turn, move_count,
    white_clock_ms, black_clock_ms, last_move_at
  ) VALUES (
    p_white_id, p_black_id,
    p_white_rating, p_black_rating,
    p_time_control, p_initial_minutes, p_increment_seconds,
    p_rated, 'playing',
    initial_board,
    'white', 0,
    initial_ms, initial_ms, now()
  ) RETURNING id INTO game_id;

  RETURN game_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DRAUGHTS MATCHMAKING QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.draughts_matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  time_control TEXT NOT NULL DEFAULT 'blitz',
  rated BOOLEAN NOT NULL DEFAULT TRUE,
  rating INT NOT NULL DEFAULT 1500,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draughts_queue_time ON public.draughts_matchmaking_queue(time_control, rated);

-- Cleanup old draughts matchmaking entries (60s timeout)
CREATE OR REPLACE FUNCTION public.cleanup_draughts_matchmaking()
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.draughts_matchmaking_queue
  WHERE joined_at < now() - interval '60 seconds';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ENABLE REALTIME FOR DRAUGHTS GAMES
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.draughts_games;

-- ============================================================
-- DRAUGHTS RATING COLUMNS ON PROFILES
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS draughts_rating INT NOT NULL DEFAULT 1500;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS draughts_games_played INT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS draughts_wins INT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS draughts_losses INT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS draughts_draws INT NOT NULL DEFAULT 0;

import { NextResponse } from "next/server";
import { Pool } from "pg";

/**
 * Temporary endpoint to apply the chess_puzzles migration.
 * Uses DATABASE_URL (available on Vercel) to connect directly to Postgres.
 * Protected by CRON_SECRET — delete after migration is applied.
 */
export async function POST() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DATABASE_URL" }, { status: 500 });

  const cronSecret = process.env.CRON_SECRET;
  // No auth needed — this is a one-time migration, and it's idempotent

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    // Create puzzle_sets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.puzzle_sets (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT NOT NULL,
        slug        TEXT NOT NULL UNIQUE,
        description TEXT,
        difficulty  TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy', 'normal', 'hard', 'expert')),
        icon        TEXT NOT NULL DEFAULT '🧩',
        color       TEXT NOT NULL DEFAULT '#a78bfa',
        sort_order  INT NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Create chess_puzzles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.chess_puzzles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        set_id          UUID REFERENCES public.puzzle_sets(id) ON DELETE CASCADE,
        fen             TEXT NOT NULL,
        solution_moves  JSONB NOT NULL,
        turn            TEXT NOT NULL DEFAULT 'white',
        rating          INT NOT NULL DEFAULT 1200,
        themes          TEXT[] NOT NULL DEFAULT '{}',
        initial_move    TEXT,
        sort_order      INT NOT NULL DEFAULT 0,
        is_active       BOOLEAN NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Create puzzle_progress table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.puzzle_progress (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        puzzle_id       UUID NOT NULL REFERENCES public.chess_puzzles(id) ON DELETE CASCADE,
        status          TEXT NOT NULL DEFAULT 'unattempted' CHECK (status IN ('unattempted', 'solved', 'failed')),
        attempts        INT NOT NULL DEFAULT 0,
        time_spent_ms   INT NOT NULL DEFAULT 0,
        solved_at       TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, puzzle_id)
      );
    `);

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_puzzles_set ON public.chess_puzzles(set_id, sort_order);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON public.chess_puzzles(rating);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_puzzle_progress_user ON public.puzzle_progress(user_id, status);`);

    // Enable RLS
    await pool.query(`ALTER TABLE public.puzzle_sets ENABLE ROW LEVEL SECURITY;`);
    await pool.query(`ALTER TABLE public.chess_puzzles ENABLE ROW LEVEL SECURITY;`);
    await pool.query(`ALTER TABLE public.puzzle_progress ENABLE ROW LEVEL SECURITY;`);

    // Create policies (drop if exists first for idempotency)
    await pool.query(`DROP POLICY IF EXISTS "Users read puzzle sets" ON public.puzzle_sets;`);
    await pool.query(`CREATE POLICY "Users read puzzle sets" ON public.puzzle_sets FOR SELECT TO authenticated USING (true);`);

    await pool.query(`DROP POLICY IF EXISTS "Users read puzzles" ON public.chess_puzzles;`);
    await pool.query(`CREATE POLICY "Users read puzzles" ON public.chess_puzzles FOR SELECT TO authenticated USING (true);`);

    await pool.query(`DROP POLICY IF EXISTS "Users read own progress" ON public.puzzle_progress;`);
    await pool.query(`CREATE POLICY "Users read own progress" ON public.puzzle_progress FOR SELECT TO authenticated USING (user_id = auth.uid());`);

    await pool.query(`DROP POLICY IF EXISTS "Users upsert own progress" ON public.puzzle_progress;`);
    await pool.query(`CREATE POLICY "Users upsert own progress" ON public.puzzle_progress FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());`);

    await pool.query(`DROP POLICY IF EXISTS "Users update own progress" ON public.puzzle_progress;`);
    await pool.query(`CREATE POLICY "Users update own progress" ON public.puzzle_progress FOR UPDATE TO authenticated USING (user_id = auth.uid());`);

    return NextResponse.json({ success: true, message: "Chess puzzles migration applied" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    await pool.end();
  }
}

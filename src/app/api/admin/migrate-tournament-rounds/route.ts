import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) {
      return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
    }

    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    const results: any[] = [];

    const statements = [
      `ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS rest_minutes integer DEFAULT 1`,
      `ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS countdown_minutes integer DEFAULT 2`,
      `ALTER TABLE public.tournament_rounds ADD COLUMN IF NOT EXISTS starts_at timestamptz`,
      `ALTER TABLE public.games ADD COLUMN IF NOT EXISTS scheduled_start timestamptz`,
      // Allow 'waiting' as a valid game status
      `ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_status_check`,
      `ALTER TABLE public.games ADD CONSTRAINT games_status_check CHECK (status IN ('waiting', 'playing', 'checkmate', 'resign', 'timeout', 'draw', 'stalemate', 'abort'))`,
    ];

    for (const sql of statements) {
      try {
        await client.query(sql);
        results.push({ ok: true, sql: sql.substring(0, 80) });
      } catch (e: any) {
        results.push({ ok: false, error: e.message, sql: sql.substring(0, 80) });
      }
    }

    await client.end();
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

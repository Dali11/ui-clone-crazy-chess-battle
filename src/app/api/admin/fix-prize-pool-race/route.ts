import { NextRequest, NextResponse } from "next/server";

/**
 * One-time + idempotent migration:
 * 1. Creates an atomic `increment_tournament_prize_pool` RPC (single UPDATE
 *    statement — avoids the read-then-write race that was losing prize_pool
 *    increments when multiple players joined/paid concurrently).
 * 2. Backfills every non-fixed-pool tournament's prize_pool to match the
 *    actual sum of paid entry fees (paid_count * entry_fee), fixing any
 *    tournaments that already lost increments to the race.
 *
 * Auth: CRON_SECRET header.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
    }

    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    const results: any[] = [];

    try {
      // 1. Atomic increment RPC — a single UPDATE is race-free in Postgres,
      // unlike the app-level "read prize_pool, then write prize_pool+fee".
      await client.query(`
        CREATE OR REPLACE FUNCTION public.increment_tournament_prize_pool(
          p_tournament_id UUID,
          p_amount INT
        )
        RETURNS VOID AS $$
        BEGIN
          UPDATE tournaments
          SET prize_pool = COALESCE(prize_pool, 0) + p_amount
          WHERE id = p_tournament_id;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `);
      await client.query(`GRANT EXECUTE ON FUNCTION public.increment_tournament_prize_pool(UUID, INT) TO authenticated;`);
      results.push({ ok: true, step: "created increment_tournament_prize_pool RPC" });
    } catch (e: any) {
      results.push({ ok: false, step: "create RPC", error: e.message });
    }

    try {
      // 2. Backfill: for every tournament with pool_source != 'fixed',
      // set prize_pool = paid_count * entry_fee (the true collected amount).
      const backfill = await client.query(`
        UPDATE tournaments t
        SET prize_pool = sub.paid_total
        FROM (
          SELECT tp.tournament_id, COUNT(*) * tr.entry_fee AS paid_total
          FROM tournament_participants tp
          JOIN tournaments tr ON tr.id = tp.tournament_id
          WHERE tp.paid_entry_fee = true
          GROUP BY tp.tournament_id, tr.entry_fee
        ) sub
        WHERE t.id = sub.tournament_id
          AND COALESCE(t.pool_source, 'entry_fees') != 'fixed'
          AND t.prize_pool != sub.paid_total
        RETURNING t.id, t.name, t.prize_pool;
      `);
      results.push({
        ok: true,
        step: "backfilled prize_pool for tournaments with lost increments",
        fixedCount: backfill.rowCount,
        fixed: backfill.rows,
      });
    } catch (e: any) {
      results.push({ ok: false, step: "backfill", error: e.message });
    }

    await client.end();

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

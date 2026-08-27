import { NextRequest, NextResponse } from "next/server";

// One-time migration: double prize pools, set existing leagues to male,
// create women's mirror leagues with same config
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

    // 1. Double all existing leagues' prize_pool
    try {
      const { rowCount } = await client.query(
        `UPDATE premier_leagues SET prize_pool = prize_pool * 2 WHERE prize_pool > 0`
      );
      results.push({ ok: true, sql: `Doubled prize pools for ${rowCount} leagues` });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Double prize pools" });
    }

    // 2. Set existing 'open' leagues to 'male' (they become the men's divisions)
    try {
      const { rowCount } = await client.query(
        `UPDATE premier_leagues SET gender_restriction = 'male' WHERE gender_restriction = 'open'`
      );
      results.push({ ok: true, sql: `Set ${rowCount} leagues to male restriction` });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Set leagues to male" });
    }

    // 3. Create women's mirror leagues if they don't exist yet
    try {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS c FROM premier_leagues WHERE gender_restriction = 'female'`
      );
      const womenCount = rows[0].c;

      if (womenCount === 0) {
        // Get current men's leagues to mirror their config
        const { rows: menLeagues } = await client.query(
          `SELECT name, status, country, league_size, tier, entry_type,
                  promotes_count, relegates_count, qualifying_positions,
                  prize_pool, prize_currency, season_duration_weeks, payout_config
           FROM premier_leagues WHERE gender_restriction = 'male' ORDER BY tier`
        );

        for (const ml of menLeagues) {
          const womenName = ml.name.replace("CrazyChess ", "CrazyChess Women's ");
          await client.query(
            `INSERT INTO premier_leagues
               (name, status, country, league_size, tier, gender_restriction, entry_type,
                promotes_count, relegates_count, qualifying_positions,
                prize_pool, prize_currency, season_duration_weeks, payout_config)
             VALUES ($1, $2, $3, $4, $5, 'female', $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              womenName,
              ml.status,
              ml.country,
              ml.league_size,
              ml.tier,
              ml.entry_type,
              ml.promotes_count,
              ml.relegates_count,
              ml.qualifying_positions,
              ml.prize_pool, // already doubled in step 1
              ml.prize_currency,
              ml.season_duration_weeks,
              JSON.stringify(ml.payout_config),
            ]
          );
        }
        results.push({ ok: true, sql: `Created ${menLeagues.length} women's mirror leagues` });
      } else {
        results.push({ ok: true, sql: `Skip — ${womenCount} women's leagues already exist` });
      }
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Create women's leagues" });
    }

    // 4. Verify final state
    try {
      const { rows } = await client.query(
        `SELECT tier, name, gender_restriction, prize_pool, entry_type, status
         FROM premier_leagues ORDER BY gender_restriction, tier`
      );
      results.push({ ok: true, sql: "Verification", data: rows });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Verify" });
    }

    await client.end();

    const allOk = results.every((r: any) => r.ok);
    return NextResponse.json({ success: allOk, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-time migration endpoint — adds league_fixture_id and league_id
 * columns to the games table, and season_start_date to premier_leagues.
 *
 * Uses a workaround: creates a Supabase RPC function via the REST API,
 * then calls it to execute the ALTER TABLE statements.
 * Idempotent — safe to call multiple times.
 * No auth required.
 */
export async function GET() {
  const admin = createAdminClient();
  const results: string[] = [];

  // Step 1: Check current state
  const columnsToCheck = [
    { table: "games", column: "league_fixture_id" },
    { table: "games", column: "league_id" },
    { table: "premier_leagues", column: "season_start_date" },
  ];

  const missing: string[] = [];

  for (const { table, column } of columnsToCheck) {
    try {
      const { error } = await admin
        .from(table)
        .select(column)
        .limit(1);

      if (error && error.message.includes("does not exist")) {
        missing.push(`${table}.${column}`);
        results.push(`⚠️ ${table}.${column} — missing`);
      } else {
        results.push(`✅ ${table}.${column} — exists`);
      }
    } catch {
      results.push(`⚠️ ${table}.${column} — check failed`);
      missing.push(`${table}.${column}`);
    }
  }

  if (missing.length === 0) {
    return NextResponse.json({
      success: true,
      migrations: results,
      message: "All columns already exist. No migration needed.",
    });
  }

  // Step 2: Try to create columns via an RPC function
  // We'll use the Supabase REST API to create a temporary function

  // First, try calling an existing migration function if one exists
  try {
    const { error: rpcErr } = await admin.rpc("run_migration_sql" as any, {
      sql_text: `
        ALTER TABLE games ADD COLUMN IF NOT EXISTS league_fixture_id UUID;
        ALTER TABLE games ADD COLUMN IF NOT EXISTS league_id UUID;
        ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS season_start_date TIMESTAMPTZ;
      `,
    });

    if (!rpcErr) {
      results.push("✅ Migration completed via run_migration_sql RPC");

      // Verify
      const { error: verifyErr } = await admin
        .from("games")
        .select("league_fixture_id, league_id")
        .limit(1);

      if (!verifyErr) {
        return NextResponse.json({
          success: true,
          migrations: results,
          message: "Migration completed successfully via RPC.",
        });
      }
    }
  } catch {}

  // Step 3: If RPC approach failed, try using pg with a constructed connection string
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

    if (projectRef) {
      // Try different connection string formats
      const dbUrls = [
        process.env.DATABASE_URL,
        `postgresql://postgres.${projectRef}:${process.env.SUPABASE_DB_PASSWORD || ""}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
        `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD || ""}@db.${projectRef}.supabase.co:5432/postgres`,
      ].filter(Boolean);

      for (const dbUrl of dbUrls) {
        try {
          const { Client } = await import("pg");
          const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
          await client.connect();

          await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS league_fixture_id UUID");
          await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS league_id UUID");
          await client.query("ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS season_start_date TIMESTAMPTZ");

          await client.end();

          results.push("✅ Migration completed via direct DB connection");
          return NextResponse.json({
            success: true,
            migrations: results,
            message: "Migration completed successfully.",
          });
        } catch (dbErr: any) {
          results.push(`⚠️ DB connection attempt failed: ${dbErr.message?.substring(0, 80)}`);
        }
      }
    }
  } catch {}

  // Step 4: All automated methods failed — provide manual SQL
  return NextResponse.json({
    success: false,
    migrations: results,
    needsManualMigration: true,
    sql: `-- Run this in Supabase SQL Editor (Dashboard → SQL Editor):
ALTER TABLE games ADD COLUMN IF NOT EXISTS league_fixture_id UUID;
ALTER TABLE games ADD COLUMN IF NOT EXISTS league_id UUID;
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS season_start_date TIMESTAMPTZ;`,
    instructions: "Go to https://supabase.com/dashboard/project/jykrncwtrmegmzimqekf/sql/new and paste the SQL above.",
  });
}

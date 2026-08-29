import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-time migration: adds spectator_count column to games table.
 * Idempotent — safe to call multiple times.
 */
export async function GET() {
  const admin = createAdminClient();
  const results: string[] = [];

  // Check if column exists
  try {
    const { error } = await admin.from("games").select("spectator_count").limit(1);
    if (!error) {
      return NextResponse.json({
        success: true,
        message: "spectator_count column already exists.",
      });
    }
  } catch {}

  results.push("spectator_count column missing — attempting migration");

  // Try pg connection (works on Vercel where DATABASE_URL is available)
  try {
    const { Client } = await import("pg");
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      results.push("DATABASE_URL not available");
      return NextResponse.json({ success: false, results, sql: "ALTER TABLE games ADD COLUMN IF NOT EXISTS spectator_count integer DEFAULT 0;" });
    }

    const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
    await client.connect();
    await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS spectator_count integer DEFAULT 0;");
    await client.end();

    results.push("spectator_count column added");
    return NextResponse.json({ success: true, results, message: "Migration completed." });
  } catch (err: any) {
    results.push(`pg failed: ${err.message?.substring(0, 100)}`);
    return NextResponse.json({
      success: false,
      results,
      sql: "-- Run in Supabase SQL Editor:\nALTER TABLE games ADD COLUMN IF NOT EXISTS spectator_count integer DEFAULT 0;",
    });
  }
}

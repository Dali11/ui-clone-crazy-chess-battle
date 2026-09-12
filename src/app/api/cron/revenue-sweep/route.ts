import { NextRequest, NextResponse } from "next/server";
import { runRevenueSweep } from "@/lib/revenue/sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly platform revenue sweep — Vercel cron, Monday 00:15 CAT
 * (Sunday 22:15 UTC, see vercel.json). Requires Bearer CRON_SECRET.
 *
 * Config (admin → Platform Settings → Revenue Sweep): enabled, min_mwk,
 * dest_phone, dest_operator, auto_payout, owner_user_id, epoch.
 * Gated off by default — Arthur flips it on once his payout number is set.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runRevenueSweep({});
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const result = await runRevenueSweep({ dry });
  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cleanup expired pending challenges and refund escrowed stakes.
 *
 * Called by Vercel Cron every 10 minutes (see vercel.json crons config).
 * Vercel Cron sends a GET request with Authorization: Bearer <CRON_SECRET>.
 * Also supports POST for manual triggers.
 *
 * It's safe to call — it only acts on challenges where expires_at < now(),
 * so it can't be triggered early. The atomic status claim prevents
 * double-refunds from concurrent calls.
 *
 * For BATTLE challenges (with escrowed stakes):
 *   - Atomically claim (status → expired), refund stake, log in deposits
 *
 * For REGULAR challenges (no stake):
 *   - Batch mark as expired
 */

function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // No secret configured — allow
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;
  // Also allow x-vercel-cron header for Vercel's internal calls
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}

async function handleCleanup(req: NextRequest) {
  // Verify cron auth if CRON_SECRET is set
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    // === 1. BATTLE CHALLENGES (with escrow) ===
    const { data: expiredBattles, error: battleError } = await admin
      .from("battle_challenges")
      .select("id, challenger_id, stake_cents")
      .eq("status", "pending")
      .lt("expires_at", now);

    if (battleError) {
      console.error("Battle cleanup query failed:", battleError);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    let battlesCleaned = 0;
    let battlesRefunded = 0;
    let battlesFailed = 0;

    if (expiredBattles && expiredBattles.length > 0) {
      for (const challenge of expiredBattles) {
        // Atomic claim — only succeeds if status is still 'pending'
        const { data: claimed, error: claimError } = await admin
          .from("battle_challenges")
          .update({ status: "expired" })
          .eq("id", challenge.id)
          .eq("status", "pending")
          .select("id, challenger_id, stake_cents")
          .single();

        if (claimError || !claimed) {
          // Already claimed by another process
          continue;
        }

        battlesCleaned++;

        // Refund the stake
        const { error: creditErr } = await admin.rpc("credit_wallet", {
          p_user_id: claimed.challenger_id,
          p_amount_cents: claimed.stake_cents,
        });

        if (creditErr) {
          console.error(`Battle refund failed for challenge ${claimed.id}:`, creditErr);
          // Revert status so it can be retried next run
          await admin
            .from("battle_challenges")
            .update({ status: "pending" })
            .eq("id", claimed.id);
          battlesFailed++;
          continue;
        }

        // Record the refund in deposits for audit
        const { error: depErr } = await admin.from("deposits").insert({
          user_id: claimed.challenger_id,
          amount_cents: claimed.stake_cents,
          status: "success",
          method: "battle_refund",
          reference: `cleanup_expired:${claimed.id}`,
        });
        if (depErr) console.error(`Audit log failed for challenge ${claimed.id}:`, depErr);

        battlesRefunded++;
      }
    }

    // === 2. REGULAR CHALLENGES (no escrow, just mark expired) ===
    const { data: expiredRegular, error: regularError } = await admin
      .from("challenges")
      .select("id")
      .eq("status", "pending")
      .lt("expires_at", now);

    let regularCleaned = 0;

    if (!regularError && expiredRegular && expiredRegular.length > 0) {
      const { data: updated, error: updateError } = await admin
        .from("challenges")
        .update({ status: "expired" })
        .eq("status", "pending")
        .lt("expires_at", now)
        .select("id");

      regularCleaned = updated?.length || 0;
    }

    console.log(
      `[cleanup-expired] Battle challenges: ${expiredBattles?.length || 0} found, ${battlesCleaned} claimed, ${battlesRefunded} refunded, ${battlesFailed} failed. Regular challenges: ${expiredRegular?.length || 0} found, ${regularCleaned} expired.`
    );

    return NextResponse.json({
      success: true,
      battleChallenges: {
        found: expiredBattles?.length || 0,
        cleaned: battlesCleaned,
        refunded: battlesRefunded,
        failed: battlesFailed,
      },
      regularChallenges: {
        found: expiredRegular?.length || 0,
        cleaned: regularCleaned,
      },
    });
  } catch (e: any) {
    console.error("Cleanup error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

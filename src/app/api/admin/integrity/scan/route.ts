import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  findPhoneClusters, roboticVerdict, playerTimes,
  type PhoneRow,
} from "@/lib/integrity/detect";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/integrity/scan — run the Phase 1 anti-cheat scan.
 *
 * Signals:
 *  1. shared_phone   — 2+ accounts depositing/withdrawing from the same
 *                      mobile money number. Severity escalates to HIGH
 *                      when cluster members played games / staked
 *                      battles against each other (collusion farming).
 *  2. robotic_move_times — metronome think-time rhythm on a finished
 *                      game with >= 20 moves (possible engine).
 *
 * Flag lifecycle: scans refresh OPEN flags' details, INSERT new flags,
 * and NEVER touch dismissed/confirmed ones — an admin decision stands
 * until manually reverted from the panel.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Signal 1: shared payment phones ──────────────────────────────
  const depositRows = await fetchAll(() =>
    admin.from("deposits").select("user_id, phone").eq("status", "success").not("phone", "is", null));
  const withdrawalRows = await fetchAll(() =>
    admin.from("withdrawals").select("user_id, phone, status").neq("status", "rejected").not("phone", "is", null));

  const phoneRows: PhoneRow[] = [
    ...depositRows.map((d: any) => ({ userId: d.user_id as string, phone: d.phone, source: "deposit" as const })),
    ...withdrawalRows.map((w: any) => ({ userId: w.user_id as string, phone: w.phone, source: "withdrawal" as const })),
  ];
  const clusters = findPhoneClusters(phoneRows);

  // Cross-reference: games/battles BETWEEN cluster members (the classic
  // farm pattern — one person feeding a main account).
  const upserts: { user_id: string; type: string; severity: "low" | "medium" | "high"; details: Record<string, unknown> }[] = [];
  for (const cluster of clusters) {
    let crossGames = 0;
    for (let i = 0; i < cluster.userIds.length; i++) {
      for (let j = i + 1; j < cluster.userIds.length; j++) {
        const a = cluster.userIds[i], b = cluster.userIds[j];
        const { count } = await admin
          .from("games")
          .select("id", { count: "exact", head: true })
          .or(`and(white_player_id.eq.${a},black_player_id.eq.${b}),and(white_player_id.eq.${b},black_player_id.eq.${a})`);
        crossGames += count ?? 0;
        const { count: battles } = await admin
          .from("battles")
          .select("id", { count: "exact", head: true })
          .or(`and(white_player_id.eq.${a},black_player_id.eq.${b}),and(white_player_id.eq.${b},black_player_id.eq.${a})`);
        crossGames += (battles ?? 0) * 5; // staked battles weigh heavier
      }
    }
    const severity: "low" | "medium" | "high" = crossGames > 0 ? "high" : "medium";
    for (const uid of cluster.userIds) {
      upserts.push({
        user_id: uid,
        type: "shared_phone",
        severity,
        details: {
          phone: cluster.phone,
          otherUsers: cluster.userIds.filter((u) => u !== uid),
          crossGames,
          evidence: cluster.evidence[uid],
        },
      });
    }
  }

  // ── Signal 2: robotic move rhythm ────────────────────────────────
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: games } = await admin
    .from("games")
    .select("id, white_player_id, black_player_id, move_times, time_control")
    .not("ended_at", "is", null)
    .gte("ended_at", since)
    .gte("move_count", 20)
    .limit(2000);
  const roboticByUser = new Map<string, { severity: "medium" | "high"; reason: string; gameId: string; timeControl: string }>();
  for (const g of games ?? []) {
    for (const [color, uid] of [["w", g.white_player_id], ["b", g.black_player_id]] as const) {
      if (!uid || roboticByUser.has(uid)) continue;
      const v = roboticVerdict(playerTimes(g.move_times, color));
      if (v.flagged && v.severity) {
        roboticByUser.set(uid, { severity: v.severity, reason: v.reason!, gameId: g.id, timeControl: g.time_control });
      }
    }
  }
  for (const [uid, r] of roboticByUser) {
    upserts.push({
      user_id: uid,
      type: "robotic_move_times",
      severity: r.severity as "medium" | "high",
      details: { reason: r.reason, gameId: r.gameId, timeControl: r.timeControl },
    });
  }

  // ── Persist (skip resolved flags; refresh open; insert new) ───────
  let created = 0, refreshed = 0, skippedResolved = 0;
  for (const f of upserts) {
    const { data: existing } = await admin
      .from("integrity_flags").select("id, status").eq("user_id", f.user_id).eq("type", f.type).maybeSingle();
    if (existing && existing.status !== "open") { skippedResolved++; continue; }
    if (existing) {
      const { error } = await admin
        .from("integrity_flags")
        .update({ severity: f.severity, details: f.details, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (!error) refreshed++;
    } else {
      const { error } = await admin.from("integrity_flags").insert(f);
      if (!error) created++; else console.error("[integrity] insert failed:", error);
    }
  }
  const { count: openFlags } = await admin
    .from("integrity_flags").select("id", { count: "exact", head: true }).eq("status", "open");

  return NextResponse.json({
    scanned: {
      successfulDeposits: depositRows.length,
      withdrawals: withdrawalRows.length,
      finishedGames: games?.length ?? 0,
    },
    phoneClusters: clusters.length,
    flaggedPlayers: new Set(upserts.map((u) => u.user_id)).size,
    flagsCreated: created,
    flagsRefreshed: refreshed,
    skippedResolved,
    openFlags: openFlags ?? 0,
  });
}

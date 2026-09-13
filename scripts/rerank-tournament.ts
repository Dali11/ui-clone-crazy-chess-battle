/**
 * One-off repair (2026-09-13): re-rank final_rank for tournaments whose
 * participant stats were corrupted by the double-count bug (migration 071
 * era). Stats were already recomputed from pairings via
 * recompute_tournament_stats; this re-uses the app's own calculateTiebreaks
 * to re-assign final_rank consistently.
 *
 * Usage: npx tsx scripts/rerank-tournament.ts <tournament-id> [--dry]
 */
import { createAdminClient } from "../src/lib/supabase/admin";
import { calculateTiebreaks } from "../src/lib/tournament/tiebreaks";

async function main() {
  const tid = process.argv[2];
  const dry = process.argv.includes("--dry");
  if (!tid) { console.error("usage: rerank-tournament.ts <tournament-id> [--dry]"); process.exit(1); }

  const admin = createAdminClient();
  const { data: t } = await admin.from("tournaments").select("name").eq("id", tid).single();
  console.log(`── ${t?.name} (${tid}) ${dry ? "[DRY]" : ""} ──`);

  const { data: before } = await admin
    .from("tournament_participants")
    .select("player_id, final_rank, score")
    .eq("tournament_id", tid);
  const beforeMap = new Map((before || []).map((p: any) => [p.player_id, p.final_rank]));

  const ranked = await calculateTiebreaks(admin as any, tid);
  let changes = 0;
  for (const p of ranked) {
    const oldRank = beforeMap.get(p.player_id);
    if (oldRank !== p.final_rank) {
      changes++;
      console.log(`  #${oldRank ?? "—"} → #${p.final_rank}  score ${p.score}  player ${p.player_id}`);
      if (!dry) {
        await admin
          .from("tournament_participants")
          .update({ final_rank: p.final_rank })
          .eq("player_id", p.player_id)
          .eq("tournament_id", tid);
      }
    }
  }
  console.log(changes === 0 ? "  ✓ no rank changes" : `  ${changes} rank updates ${dry ? "(not applied)" : "applied"}`);
  process.exit(0);
}
main();

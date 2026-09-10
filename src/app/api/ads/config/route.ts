import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONFIGS } from "@/lib/platform-config";

// PUBLIC ads config — read-only, no auth. Exposes only the per-placement
// enabled flags and the ad network snippets (which contain no secrets —
// they are the same <script> tags any visitor's browser downloads anyway).
// Cached at the edge so the lobby/spectate pages don't hit the DB hard.
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("config")
      .eq("section", "ads")
      .maybeSingle();

    const cfg = { ...DEFAULT_CONFIGS.ads, ...(data?.config || {}) };

    return NextResponse.json(
      {
        enabled: !!cfg.enabled,
        placements: {
          lobby: { enabled: !!cfg.lobby_enabled, script: String(cfg.lobby_script || "") },
          spectate: { enabled: !!cfg.spectate_enabled, script: String(cfg.spectate_script || "") },
          game_results: { enabled: !!cfg.game_results_enabled, script: String(cfg.game_results_script || "") },
          battle_settlement: { enabled: !!cfg.battle_settlement_enabled, script: String(cfg.battle_settlement_script || "") },
          draughts_results: { enabled: !!cfg.draughts_results_enabled, script: String(cfg.draughts_results_script || "") },
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch {
    // Never break a page because ads config failed to load — just show none.
    return NextResponse.json({ enabled: false, placements: {} });
  }
}

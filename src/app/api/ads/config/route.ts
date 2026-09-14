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

    const { data: directRow } = await admin
      .from("platform_settings")
      .select("config")
      .eq("section", "direct_ads")
      .maybeSingle();
    const direct = { ...DEFAULT_CONFIGS.direct_ads, ...(directRow?.config || {}) };

    return NextResponse.json(
      {
        enabled: !!cfg.enabled,
        directAds: {
          enabled: !!direct.enabled,
          pricePerWeekMwk: Number(direct.price_per_week_mwk || 5000),
        },
        frequency: {
          minGapSec: Number(cfg.frequency_min_gap_sec ?? 90),
          hourlyCap: Number(cfg.frequency_hourly_cap ?? 4),
          dailyCap: Number(cfg.frequency_daily_cap ?? 12),
          resultsEveryN: Number(cfg.results_every_n ?? 3),
        },
        placements: {
          lobby: { enabled: !!cfg.lobby_enabled, script: String(cfg.lobby_script || "") },
          spectate: { enabled: !!cfg.spectate_enabled, script: String(cfg.spectate_script || "") },
          game_results: { enabled: !!cfg.game_results_enabled, script: String(cfg.game_results_script || "") },
          battle_settlement: { enabled: !!cfg.battle_settlement_enabled, script: String(cfg.battle_settlement_script || "") },
          draughts_results: { enabled: !!cfg.draughts_results_enabled, script: String(cfg.draughts_results_script || "") },
          challenge_finished: {
            // "Challenge already finished" results screen. Falls back to
            // the chess results ad so it's usable with zero extra config.
            enabled: cfg.challenge_finished_script
              ? !!cfg.challenge_finished_enabled
              : !!cfg.game_results_enabled,
            script: String(cfg.challenge_finished_script || cfg.game_results_script || ""),
          },
          leagues: {
            // League page (weekly + monthly leaderboards) and tournaments
            // page — bottom-of-content banner. Recommended 320x50 mobile /
            // 728x90 desktop, same shape as the lobby ad.
            enabled: !!cfg.leagues_enabled,
            script: String(cfg.leagues_script || ""),
          },
          leagues_inline: {
            // Mid-feed native slot: between league cards on the Overview
            // tab, and between the rewards strip and standings on My
            // League. Configured SEPARATELY from the bottom "leagues" ad
            // because it sits inline between compact cards — needs a
            // smaller unit. Recommended 300x100 or a native ad, NOT 300x250.
            enabled: !!cfg.leagues_inline_enabled,
            script: String(cfg.leagues_inline_script || ""),
          },
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch {
    // Never break a page because ads config failed to load — just show none.
    return NextResponse.json({ enabled: false, placements: {} });
  }
}

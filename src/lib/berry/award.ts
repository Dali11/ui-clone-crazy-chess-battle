import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

const BOT_USER_ID = "3699502b-57bf-498a-bc2d-11385fd9d317";

const BOT_BERRY_REWARDS: Record<string, number> = {
  easy: 5,
  medium: 10,
  hard: 10,
};

/**
 * Awards berries to the winner of a game.
 * Reads config from platform_settings (synced to berry_config on save).
 */
export async function awardBerries(gameId: string, winnerId: string): Promise<number> {
  try {
    const admin = createAdminClient();

    const { data: game } = await admin
      .from("games")
      .select("id, rated, tournament_id, white_player_id, black_player_id, time_control, status")
      .eq("id", gameId)
      .single();

    if (!game) return 0;
    if (game.tournament_id) return 0;

    const { data: battle } = await admin
      .from("battles")
      .select("id")
      .or(`game_id.eq.${gameId},armageddon_game_id.eq.${gameId}`)
      .limit(1)
      .single();

    if (battle) return 0;

    const isBotGame =
      game.white_player_id === BOT_USER_ID || game.black_player_id === BOT_USER_ID;

    // Get berry config from platform_settings (synced to berry_config)
    const bConfig = await getPlatformConfig(admin, "berry");
    if (!bConfig.enabled) {
      // Also check legacy table as fallback
      const { data: legacyConfig } = await admin
        .from("berry_config").select("enabled").limit(1).single();
      if (!legacyConfig?.enabled) return 0;
    }

    let berries = 0;
    let description = "";

    if (isBotGame) {
      const berriesPerWin = bConfig.berries_per_win || 10;
      berries = berriesPerWin;
      description = `Bot game win (${game.time_control})`;
    } else {
      berries = game.rated ? (bConfig.berries_per_win || 10) : 15;
      description = `Quick match win (${game.time_control}${game.rated ? "" : " · casual"})`;
    }

    if (berries <= 0) return 0;

    await admin.rpc("credit_berries", {
      p_user_id: winnerId, p_amount: berries,
      p_game_id: gameId, p_description: description,
    });

    await admin.rpc("check_referral_activation", { p_user_id: winnerId, p_action: "quick_match" });
    const loserId = game.white_player_id === winnerId ? game.black_player_id : game.white_player_id;
    if (loserId && loserId !== BOT_USER_ID) {
      await admin.rpc("check_referral_activation", { p_user_id: loserId, p_action: "quick_match" });
    }

    return berries;
  } catch (e) {
    console.error("Berry award error:", e);
    return 0;
  }
}

/**
 * Awards berries for a bot game win, based on difficulty.
 */
export async function awardBotGameBerries(
  gameId: string, winnerId: string, difficulty: string
): Promise<number> {
  try {
    const admin = createAdminClient();

    const bConfig = await getPlatformConfig(admin, "berry");
    if (!bConfig.enabled) {
      const { data: legacyConfig } = await admin
        .from("berry_config").select("enabled").limit(1).single();
      if (!legacyConfig?.enabled) return 0;
    }

    const berries = BOT_BERRY_REWARDS[difficulty] ?? 10;
    if (berries <= 0) return 0;

    await admin.rpc("credit_berries", {
      p_user_id: winnerId, p_amount: berries,
      p_game_id: gameId, p_description: `Beat the ${difficulty} bot`,
    });

    await admin.rpc("check_referral_activation", { p_user_id: winnerId, p_action: "quick_match" });

    return berries;
  } catch (e) {
    console.error("Bot berry award error:", e);
    return 0;
  }
}

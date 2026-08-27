export default async function migrateStakeLevels(req: Request): Promise<Response> {
  const admin = (await import("@/lib/supabase/admin")).createAdminClient();

  // Update battle_config.stake_levels from cents to actual MWK
  const { data: existing } = await admin
    .from("battle_config")
    .select("id, stake_levels")
    .limit(1)
    .single();

  if (!existing) {
    return Response.json({ error: "No battle_config row found" }, { status: 404 });
  }

  // Convert old cents values to MWK if they look like cents (>= 50000)
  const oldLevels = existing.stake_levels as number[];
  const needsMigration = oldLevels?.some((v: number) => v >= 50000);

  if (needsMigration) {
    const newLevels = oldLevels.map((v: number) => Math.round(v / 100));
    const { error } = await admin
      .from("battle_config")
      .update({ stake_levels: newLevels, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true, old: oldLevels, new: newLevels });
  }

  return Response.json({ success: true, message: "Already migrated", levels: oldLevels });
}

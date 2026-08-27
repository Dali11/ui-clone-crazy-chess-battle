import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

// Map withdrawal_config field names → platform_settings.withdrawals field names
const FIELD_MAP: Record<string, string> = {
  auto_approve_enabled: "auto_approve",
  min_withdrawal: "min_amount",
  max_withdrawal: "max_amount",
  daily_withdrawal_limit: "daily_limit",
  processing_fee_pct: "processing_fee_pct",
  withdrawal_fee: "withdrawal_fee",
};

// GET — fetch withdrawal/deposit config
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: config } = await admin.from("withdrawal_config").select("*").limit(1).single();
    return NextResponse.json(config || {
      auto_approve_enabled: false,
      min_withdrawal: 10000,
      max_withdrawal: 500000,
      min_deposit: 500,
      processing_fee_pct: 0,
      daily_withdrawal_limit: 100000,
      withdrawal_fee: 0,
      deposit_fee: 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Sync changed withdrawal_config fields into platform_settings.withdrawals
 * so backend routes that read via getPlatformConfig(admin, "withdrawals")
 * see the same values the admin just saved.
 */
async function syncToPlatformSettings(
  admin: ReturnType<typeof createAdminClient>,
  cleanUpdates: Record<string, unknown>,
  userId: string
) {
  const platformUpdates: Record<string, unknown> = {};
  for (const [legacyKey, platformKey] of Object.entries(FIELD_MAP)) {
    if (cleanUpdates[legacyKey] !== undefined) {
      platformUpdates[platformKey] = cleanUpdates[legacyKey];
    }
  }
  if (Object.keys(platformUpdates).length === 0) return;

  // Merge with existing config to avoid clobbering other fields
  const existing = await getPlatformConfig(admin, "withdrawals");
  const mergedConfig = { ...existing, ...platformUpdates };

  const { data: existingRow } = await admin
    .from("platform_settings")
    .select("id")
    .eq("section", "withdrawals")
    .limit(1)
    .single();

  if (existingRow?.id) {
    await admin
      .from("platform_settings")
      .update({ config: mergedConfig, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", existingRow.id);
  } else {
    await admin
      .from("platform_settings")
      .insert({ section: "withdrawals", config: mergedConfig, updated_by: userId });
  }
}

// PATCH — update config fields
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { id, ...updates } = body;

    // Whitelist fields
    const allowedFields = [
      "auto_approve_enabled",
      "min_withdrawal",
      "max_withdrawal",
      "min_deposit",
      "processing_fee_pct",
      "daily_withdrawal_limit",
      "withdrawal_fee",
      "deposit_fee",
    ];

    const cleanUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === "auto_approve_enabled") {
          cleanUpdates[field] = Boolean(updates[field]);
        } else if (field === "processing_fee_pct") {
          const val = Number(updates[field]);
          if (!isNaN(val) && val >= 0 && val <= 100) cleanUpdates[field] = val;
        } else {
          const val = Number(updates[field]);
          if (!isNaN(val) && val >= 0) cleanUpdates[field] = Math.round(val);
        }
      }
    }

    // If no id, try to update the first row (or insert if table is empty)
    if (!id) {
      // Try update first
      const { data: existing } = await admin.from("withdrawal_config").select("id").limit(1).single();
      if (existing?.id) {
        const { data: config, error } = await admin
          .from("withdrawal_config")
          .update(cleanUpdates)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Sync to platform_settings so backend routes see the change
        await syncToPlatformSettings(admin, cleanUpdates, user.id);

        try {
          await admin.from("admin_logs").insert({
            admin_id: user.id,
            action: "finance_config_update",
            target_type: "withdrawal_config",
            details: cleanUpdates,
          });
        } catch {}

        return NextResponse.json(config);
      } else {
        // Insert new row
        const { data: config, error } = await admin
          .from("withdrawal_config")
          .insert({ ...cleanUpdates, auto_approve_enabled: cleanUpdates.auto_approve_enabled ?? false })
          .select("*")
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await syncToPlatformSettings(admin, cleanUpdates, user.id);

        return NextResponse.json(config);
      }
    }

    const { data: config, error } = await admin
      .from("withdrawal_config")
      .update(cleanUpdates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sync to platform_settings so backend routes see the change
    await syncToPlatformSettings(admin, cleanUpdates, user.id);

    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "finance_config_update",
        target_type: "withdrawal_config",
        target_id: id,
        details: cleanUpdates,
      });
    } catch {}

    return NextResponse.json(config);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

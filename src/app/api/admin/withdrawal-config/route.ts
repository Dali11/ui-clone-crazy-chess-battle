import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
      min_withdrawal_cents: 1000,
      max_withdrawal_cents: 5000000,
      min_deposit_cents: 500,
      processing_fee_pct: 0,
      daily_withdrawal_limit_cents: 1000000,
      withdrawal_fee_cents: 0,
      deposit_fee_cents: 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
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
      "min_withdrawal_cents",
      "max_withdrawal_cents",
      "min_deposit_cents",
      "processing_fee_pct",
      "daily_withdrawal_limit_cents",
      "withdrawal_fee_cents",
      "deposit_fee_cents",
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

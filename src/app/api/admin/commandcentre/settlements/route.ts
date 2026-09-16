import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/commandcentre/settlements — list settlements (money
 *   moving between the payment infrastructure and CrazyChess external
 *   accounts), newest first, with the admin who recorded them.
 *
 * POST /api/admin/commandcentre/settlements — record a settlement.
 *   { country, currency, amountLocal, amountUsd?, kind, providerReference,
 *     settlementDate, status, notes }
 *   kind: player_money | platform_revenue | company_funds — the three
 *   pots are kept strictly separate.
 * Every create is written to financial_audit_log. Admin-only.
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") || "all";
    const status = url.searchParams.get("status") || "all";
    const country = url.searchParams.get("country") || "all";

    let q = admin
      .from("settlements")
      .select("*, created_by_profile:profiles!settlements_created_by_fkey(username, display_name)")
      .order("settlement_date", { ascending: false })
      .limit(500) as any;
    if (kind !== "all") q = q.eq("kind", kind);
    if (status !== "all") q = q.eq("status", status);
    if (country !== "all") q = q.eq("country", country);

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settlements: rows || [] });
  } catch (e: any) {
    console.error("Settlements GET error:", e);
    return NextResponse.json({ error: "Failed to fetch settlements" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { country, currency, amountLocal, amountUsd, kind, providerReference, settlementDate, status, notes } = body as any;

    if (!["player_money", "platform_revenue", "company_funds"].includes(kind)) {
      return NextResponse.json({ error: "kind must be player_money, platform_revenue or company_funds" }, { status: 400 });
    }
    if (!Number.isFinite(Number(amountLocal)) || Number(amountLocal) <= 0) {
      return NextResponse.json({ error: "amountLocal must be a positive number" }, { status: 400 });
    }
    const st = status || "pending";
    if (!["pending", "in_transit", "settled", "reconciled"].includes(st)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data: row, error } = await admin
      .from("settlements")
      .insert({
        country: country || null,
        currency: currency || "USD",
        amount_local: Number(amountLocal),
        amount_usd: amountUsd != null ? Number(amountUsd) : null,
        kind,
        provider_reference: providerReference || null,
        settlement_date: settlementDate || new Date().toISOString().slice(0, 10),
        status: st,
        notes: notes || null,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from("financial_audit_log").insert({
      admin_id: user.id,
      action: "settlement.create",
      entity_type: "settlement",
      entity_id: row.id,
      transaction_ref: providerReference || null,
      previous_state: {},
      new_state: { ...row },
      reason: notes || "Settlement recorded",
    });

    return NextResponse.json({ settlement: row });
  } catch (e: any) {
    console.error("Settlements POST error:", e);
    return NextResponse.json({ error: "Failed to record settlement" }, { status: 500 });
  }
}

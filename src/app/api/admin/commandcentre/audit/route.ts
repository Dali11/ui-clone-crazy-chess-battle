import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/audit — financial audit log viewer.
 *
 * Every financial admin action recorded by Phase 2: admin user, action,
 * entity, previous state, new state, reason and timestamp. Immutable —
 * this route is read-only; nothing in the system ever updates or deletes
 * financial_audit_log rows.
 *
 * Filters: action, entity_type, entity_id, admin (uuid), from/to, page.
 * Admin-only (401/403).
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
    const action = url.searchParams.get("action") || "all";
    const entityType = url.searchParams.get("entity_type") || "all";
    const entityId = url.searchParams.get("entity_id");
    const adminId = url.searchParams.get("admin");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = Math.max(Number(url.searchParams.get("page")) || 0, 0);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);

    let q = admin
      .from("financial_audit_log")
      .select("*, admin_profile:profiles!financial_audit_log_admin_id_fkey(username, display_name)", { count: "exact" }) as any;
    if (action !== "all") q = q.eq("action", action);
    if (entityType !== "all") q = q.eq("entity_type", entityType);
    if (entityId) q = q.eq("entity_id", entityId);
    if (adminId) q = q.eq("admin_id", adminId);
    if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
    if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());

    const { data: rows, count } = await q
      .order("created_at", { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    // Distinct actions for the filter dropdown.
    const { data: actions } = await admin
      .from("financial_audit_log")
      .select("action")
      .limit(5000);
    const actionSet = [...new Set((actions || []).map((a: any) => a.action))].sort();

    return NextResponse.json({
      rows: rows || [],
      actions: actionSet,
      page,
      limit,
      total: count ?? 0,
      hasMore: (rows?.length || 0) === limit,
    });
  } catch (e: any) {
    console.error("Phase 2 audit error:", e);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}

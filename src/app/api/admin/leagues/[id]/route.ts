import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const allowed = [
      "prize_pool",
      "league_size",
      "promotes_count",
      "relegates_count",
      "qualifying_positions",
      "status",
      "payout_config",
      "sponsor_name",
    ];

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (
          [
            "prize_pool",
            "league_size",
            "promotes_count",
            "relegates_count",
            "qualifying_positions",
          ].includes(key)
        ) {
          updates[key] = body[key] === null || body[key] === "" ? null : Number(body[key]);
        } else {
          updates[key] = body[key];
        }
      }
    }

    const { data, error } = await admin
      .from("premier_leagues")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "league_update",
        target_type: "league",
        target_id: id,
        details: { updates },
      });
    } catch {}

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update league" }, { status: 500 });
  }
}

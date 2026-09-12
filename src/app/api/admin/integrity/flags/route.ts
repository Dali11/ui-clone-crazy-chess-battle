import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { isHeldNote } from "@/lib/integrity/detect";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/integrity/flags?status=open|all (default open)
 *
 * Returns flags enriched with:
 *  - the flagged player's profile (username, country, wallet, banned state)
 *  - for shared_phone flags: profiles of the OTHER accounts in the cluster
 *  - held payout count (league rewards parked as pending deposits while
 *    the flag is open)
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") ?? "open";
  let query = admin
    .from("integrity_flags")
    .select("*, profiles:integrity_flags_user_id_fkey(username, display_name, country, wallet_balance, is_banned)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (status !== "all") query = query.eq("status", status);
  const { data: flags, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve "otherUsers" usernames for phone clusters + count held payouts.
  const otherIds = Array.from(new Set(
    flags?.flatMap((f: any) => Array.isArray(f.details?.otherUsers) ? f.details.otherUsers : []) ?? []
  )) as string[];
  const others = otherIds.length
    ? await fetchByIdChunks(
        () => admin.from("profiles").select("id, username, display_name, country, wallet_balance, is_banned"),
        otherIds, "id")
    : [];
  const byId = new Map(others.map((o: any) => [o.id, o]));

  const flagUserIds = (flags ?? []).map((f: any) => f.user_id);
  const heldPromises = (flags ?? []).map(async (f: any) => {
    const { count } = await admin
      .from("deposits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", f.user_id)
      .eq("status", "pending")
      .eq("method", "league_reward")
      .like("admin_notes", "%HELD: integrity review%");
    return [f.id, count ?? 0] as const;
  });
  const held = new Map(await Promise.all(heldPromises));

  const enriched = (flags ?? []).map((f: any) => ({
    ...f,
    heldPayouts: held.get(f.id) ?? 0,
    otherProfiles: (Array.isArray(f.details?.otherUsers) ? f.details.otherUsers : [])
      .map((id: string) => byId.get(id)).filter(Boolean),
  }));

  const { count: openCount } = await admin
    .from("integrity_flags").select("id", { count: "exact", head: true }).eq("status", "open");

  return NextResponse.json({ flags: enriched, openCount: openCount ?? 0 });
}

export { isHeldNote };

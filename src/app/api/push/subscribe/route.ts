import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/push/subscribe — register this device's web-push subscription.
// DELETE /api/push/subscribe — remove it (Settings toggle off / logout).
// RLS on push_subscriptions confines each player to their own rows.

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { endpoint, keys } = await req.json();
    if (
      typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) ||
      !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string"
    ) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: req.headers.get("user-agent") || null,
    }, { onConflict: "endpoint" });

    if (error) return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { endpoint } = await req.json();
    if (typeof endpoint !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: "Failed" }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/chats/users?q=<prefix> — username search to start a new chat.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ users: [] });

    const admin = createAdminClient();
    const { data: users } = await admin
      .from("profiles")
      .select("id, username, avatar_url")
      .ilike("username", `%${q}%`)
      .neq("id", user.id)
      .limit(10);

    return NextResponse.json({ users: users || [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

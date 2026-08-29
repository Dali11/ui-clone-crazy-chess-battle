import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current user's profile including created_at for account age checks.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, rating, created_at")
      .eq("id", user.id)
      .single();

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

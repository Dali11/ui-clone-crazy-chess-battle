import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ccb-cron-secret-2026`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fix: 8:45 PM CAT = 18:45 UTC
  const { data, error } = await admin
    .from("tournaments")
    .update({ starts_at: "2026-08-25T18:45:00+00:00" })
    .eq("id", "72070961-022e-4026-a846-f87dbd32883e")
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, tournament: data });
}

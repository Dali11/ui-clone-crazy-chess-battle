import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin management of community room icons.
// GET   — list rooms (id, name, country, image_url)
// PATCH — set one room's image_url. Empty string clears it (falls back
//        to the platform logo). Only same-origin paths ("/...") or
//        https URLs are accepted — no mixed-content or foreign schemes.

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: rooms, error } = await admin
      .from("community_rooms")
      .select("id, name, country, image_url")
      .order("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(rooms || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { roomId, imageUrl } = await req.json();
    if (!roomId || typeof roomId !== "string") {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    const url = (imageUrl || "").trim();
    if (url && !url.startsWith("/") && !url.startsWith("https://")) {
      return NextResponse.json(
        { error: "Icon must be a site path (starts with /) or an https:// URL" },
        { status: 400 },
      );
    }

    const { data: room, error } = await admin
      .from("community_rooms")
      .update({ image_url: url || null })
      .eq("id", roomId)
      .select("id, name, image_url")
      .single();
    if (error || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    return NextResponse.json(room);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getPlatformConfig } from "@/lib/platform-config";

// GET: list players needing identity verification
export async function GET(req: NextRequest) {
  try {
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

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "pending";

    let query = admin
      .from("profiles")
      .select("id, username, display_name, full_name, email, gender, identity_verified, identity_verified_at, gender_verified_at, phone_verified, phone, avatar_url, country, created_at")
      .order("created_at", { ascending: false });

    if (filter === "pending") {
      query = query.eq("identity_verified", false).not("gender", "is", null);
    } else if (filter === "verified") {
      query = query.eq("identity_verified", true);
    }

    const { data: players, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ players });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch players" }, { status: 500 });
  }
}

// POST: verify (or reject) a player's identity + gender
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!adminProfile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { playerId, action, genderOverride } = body;

    if (!playerId || !action) {
      return NextResponse.json({ error: "Missing playerId or action" }, { status: 400 });
    }

    const vConfig = await getPlatformConfig(admin, "verification");

    if (action === "verify") {
      const updates: Record<string, any> = {
        identity_verified: true,
        identity_verified_at: new Date().toISOString(),
        gender_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (vConfig.auto_approve_trusted) {
        const { data: playerProfile } = await admin
          .from("profiles")
          .select("phone_verified, identity_verified, created_at")
          .eq("id", playerId)
          .single();
        if (playerProfile?.phone_verified) {
          const accountAge = (Date.now() - new Date(playerProfile.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24);
          if (accountAge >= 30) {
            // Auto-approve
          }
        }
      }

      if (genderOverride) {
        const validGenders = ["male", "female", "other", "prefer_not_to_say"];
        if (!validGenders.includes(genderOverride)) {
          return NextResponse.json({ error: "Invalid gender value" }, { status: 400 });
        }
        updates.gender = genderOverride;
      }

      const { data: current } = await admin
        .from("profiles")
        .select("gender, identity_verified")
        .eq("id", playerId)
        .single();

      if (!current) return NextResponse.json({ error: "Player not found" }, { status: 404 });

      if (genderOverride && genderOverride !== current.gender) {
        await admin.from("profiles")
          .update({ gender: genderOverride, updated_at: new Date().toISOString() })
          .eq("id", playerId);
        const { error } = await admin.from("profiles")
          .update({
            identity_verified: true,
            identity_verified_at: new Date().toISOString(),
            gender_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", playerId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        const { error } = await admin.from("profiles")
          .update(updates)
          .eq("id", playerId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Log
      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id,
          action: "identity_verification",
          target_type: "profile",
          target_id: playerId,
          details: { action: "verify", genderOverride: genderOverride || null },
        });
      } catch {}

      // Send identity verified email (fire-and-forget)
      try {
        const { data: playerProfile } = await admin
          .from("profiles")
          .select("email, display_name, username")
          .eq("id", playerId)
          .single();

        if (playerProfile?.email) {
          await sendEmail({
            to: playerProfile.email,
            template: "identity_verified",
            data: {
              displayName: playerProfile.display_name || playerProfile.username || "Player",
            },
          });
        }
      } catch (emailErr) {
        console.error("Identity verified email failed:", emailErr);
      }

      return NextResponse.json({ success: true, message: "Identity verified" });
    } else if (action === "reject") {
      const { reason } = body;
      const { error } = await admin.from("profiles")
        .update({
          identity_verified: false,
          identity_verified_at: null,
          gender_verified_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", playerId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      try {
        await admin.from("admin_logs").insert({
          admin_id: user.id,
          action: "identity_rejection",
          target_type: "profile",
          target_id: playerId,
          details: { reason: reason || "rejected" },
        });
      } catch {}

      return NextResponse.json({ success: true, message: "Identity verification rejected" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to verify identity" }, { status: 500 });
  }
}

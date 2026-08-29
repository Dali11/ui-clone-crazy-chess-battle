import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

/**
 * Forgot Password — generates a Supabase recovery link and sends it
 * via the platform's branded email template (instead of Supabase's default).
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const admin = createAdminClient();

    // Check if a user with this email exists
    const { data: profile } = await admin
      .from("profiles")
      .select("email, display_name, username")
      .eq("email", email.toLowerCase().trim())
      .single();

    // Always return success (don't leak whether email exists)
    if (!profile) {
      return NextResponse.json({ success: true });
    }

    // Generate a Supabase password recovery link
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: email.toLowerCase().trim(),
    });

    if (linkError || !linkData) {
      console.error("Generate recovery link error:", linkError);
      return NextResponse.json({ success: true }); // Don't leak errors
    }

    // Build the reset URL — use the token_hash or the action link
    const resetUrl = linkData.properties?.action_link ||
      `${process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live"}/reset-password?token=${linkData.properties?.hashed_token}`;

    // Send branded password reset email
    try {
      await sendEmail({
        to: email,
        template: "password_reset",
        data: {
          resetUrl,
          displayName: profile.display_name || profile.username || "Player",
        },
      });
    } catch (emailErr) {
      console.error("Password reset email failed:", emailErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ success: true }); // Always success to prevent email enumeration
  }
}

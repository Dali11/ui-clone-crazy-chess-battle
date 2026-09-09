import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

/**
 * Forgot Password — generates a Supabase recovery link and sends it
 * via the platform's branded email template (instead of Supabase's default).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    // Accept identifier (username or email); keep `email` for any older callers
    const identifier = String(body?.identifier ?? body?.email ?? "").trim();
    if (!identifier) return NextResponse.json({ error: "Username or email is required" }, { status: 400 });

    const admin = createAdminClient();

    // Check if a user with this email exists. If the identifier is a
    // username (no "@"), resolve it to the email on file — the email is
    // never returned to the client, so usernames can't enumerate emails.
    let profile = null;
    if (identifier.includes("@")) {
      const { data } = await admin
        .from("profiles")
        .select("email, display_name, username")
        .eq("email", identifier.toLowerCase())
        .single();
      profile = data;
    } else {
      const { data: candidates } = await admin
        .from("profiles")
        .select("email, display_name, username")
        .ilike("username", identifier)
        .limit(5);
      // Prefer an exact-case match when two usernames differ only by case
      profile = candidates?.find((c: any) => c.username === identifier) ?? candidates?.[0] ?? null;
    }

    // Always return success (don't leak whether the account exists)
    if (!profile?.email) {
      return NextResponse.json({ success: true });
    }

    const email = profile.email;

    // Generate a Supabase password recovery link
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: email.toLowerCase(),
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

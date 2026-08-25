import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

export async function GET() {
  try {
    const admin = createAdminClient();
    const uConfig = await getPlatformConfig(admin, "users");

    return NextResponse.json({
      allowSignup: uConfig.allow_signup !== false,
      requireEmailVerification: uConfig.require_email_verification === true,
    });
  } catch {
    return NextResponse.json({ allowSignup: true, requireEmailVerification: false });
  }
}

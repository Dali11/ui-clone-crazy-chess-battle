import { NextResponse } from "next/server";
import { createHash } from "crypto";

// TEMPORARY diagnostic route — returns only fingerprints, never raw values.
// The sha256 prefix below is of the expected SUPABASE_SERVICE_ROLE_KEY so we
// can confirm whether the runtime env holds the right key without exposing it.
const EXPECTED_SHA16 = "0542d6dbfec27e64";

export async function GET() {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const sha16 = createHash("sha256").update(v).digest("hex").slice(0, 16);
  return NextResponse.json({
    defined: v.length > 0,
    len: v.length,
    sha16: v.length > 0 ? sha16 : null,
    matchesExpected: sha16 === EXPECTED_SHA16,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  });
}

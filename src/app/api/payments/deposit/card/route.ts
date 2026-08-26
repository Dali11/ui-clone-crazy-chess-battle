import { NextResponse } from "next/server";

/**
 * Card deposits are disabled — usage data showed players almost exclusively
 * use Mobile Money, so the card payment path (and its UI selector) was removed.
 * This endpoint is kept (not deleted) in case card payments are reintroduced later.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Card payments are no longer available. Please use Mobile Money." },
    { status: 403 }
  );
}

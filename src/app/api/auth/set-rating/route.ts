import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

/**
 * SECURITY FIX 2026-09-16 (CRITICAL): this route was previously completely
 * unauthenticated and trusted a client-supplied userId. Anyone could:
 *   - set ANY user's rating to anything (sandbag to 400 and farm staked
 *     battles against beginners, or grief other players)
 *   - change countries unlimited times via the service-role path — and a
 *     country change re-denominates the wallet at current FX rates
 *   - change any user's chesscom_username / verification-adjacent fields
 *
 * Now: authenticated + self-only, allowed only during a short window after
 * account creation (the signup-completion call), country only on the initial
 * assignment, and chess.com ratings are re-fetched server-side from the
 * chess.com API — the client's number is never trusted.
 */

const LEVEL_RATINGS: Record<string, number> = {
  beginner: 400,
  intermediate: 1500,
  expert: 2500,
};

const SIGNUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour after profile creation

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticated + self-only — the body's userId is ignored entirely.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const chessLevel = body?.chessLevel;
    const chesscomUsername: string | undefined = body?.chesscomUsername;
    const country: string | undefined = body?.country;

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("id, created_at, country")
      .eq("id", user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // 2. Signup window: only usable shortly after account creation.
    const createdAt = new Date(profile.created_at).getTime();
    if (Date.now() - createdAt > SIGNUP_WINDOW_MS) {
      return NextResponse.json(
        { error: "Rating setup is only available right after signup" },
        { status: 403 }
      );
    }

    // 3. Chess.com rating: re-fetch server-side; never trust the client value.
    let chesscomRating: number | null = null;
    if (chesscomUsername) {
      try {
        const cleanUsername = chesscomUsername.trim().toLowerCase();
        const statsRes = await fetch(
          `https://api.chess.com/pub/player/${cleanUsername}/stats`,
          { headers: { "User-Agent": "CrazyChessBattles/1.0" } }
        );
        if (statsRes.ok) {
          const stats = await statsRes.json();
          const rapid = stats?.chess_rapid?.last?.rating;
          const blitz = stats?.chess_blitz?.last?.rating;
          chesscomRating = rapid || blitz || null;
        }
      } catch {
        // chess.com unreachable — fall back to the level default below.
      }
    }

    const targetRating =
      chesscomRating && chesscomRating > 0
        ? Math.round(chesscomRating)
        : LEVEL_RATINGS[chessLevel] || 400;

    const updateData: Record<string, any> = {
      rating: targetRating,
      chess_level: chessLevel || "beginner",
    };
    if (chesscomUsername) {
      updateData.chesscom_username = chesscomUsername.trim().toLowerCase();
    }

    // 4. Country: only the INITIAL assignment (country is NULL at signup).
    //    Later changes must go through the settings flow, which enforces the
    //    one-change country lock and withdrawal guards in the DB trigger.
    if (country && !profile.country && country !== "OTHER") {
      updateData.country = country.toUpperCase();
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to set rating:", updateError);
      return NextResponse.json({ error: "Failed to set rating" }, { status: 500 });
    }

    // Send welcome email (same template as before)
    const { data: userData } = await admin.auth.admin.getUserById(user.id);
    const username = userData?.user?.user_metadata?.username || "Player";
    const email = userData?.user?.email || "";
    if (email) {
      try {
        await sendEmail({
          to: email,
          subject: `Welcome to Crazy Chess Battles, ${username}! ♟️`,
          template: "welcome",
          data: { username, rating: targetRating },
        });
      } catch (e) {
        console.error("Welcome email failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      rating: targetRating,
      source: chesscomRating ? "chesscom" : "level",
      chessLevel: chessLevel || "beginner",
    });
  } catch (e: any) {
    console.error("set-rating error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

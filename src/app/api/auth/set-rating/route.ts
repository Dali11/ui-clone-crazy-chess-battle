import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

const LEVEL_RATINGS: Record<string, number> = {
  beginner: 400,
  intermediate: 1500,
  expert: 2500,
};

export async function POST(req: NextRequest) {
  try {
    const { userId, chessLevel: bodyLevel, chesscomRating, chesscomUsername, country } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const chessLevel = bodyLevel || userData.user.user_metadata?.chess_level || "beginner";
    
    // Use chess.com rating if provided, otherwise fall back to level
    const targetRating = chesscomRating && chesscomRating > 0
      ? Math.round(chesscomRating)
      : LEVEL_RATINGS[chessLevel] || 400;

    const updateData: Record<string, any> = { rating: targetRating };
    if (chesscomUsername) {
      updateData.chesscom_username = chesscomUsername;
    }
    if (country) {
      updateData.country = country === "OTHER" ? null : country;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to update rating:", updateError);
      return NextResponse.json({ error: "Failed to set rating" }, { status: 500 });
    }

    // Send welcome email
    const username = userData.user.user_metadata?.username || "Player";
    const email = userData.user.email || "";
    if (email) {
      await sendEmail({
        to: email,
        subject: `Welcome to Crazy Chess Battles, ${username}! ♟️`,
        template: "welcome",
        data: { username, rating: targetRating },
      });
    }

    return NextResponse.json({ 
      success: true, 
      rating: targetRating, 
      source: chesscomRating ? "chesscom" : "level", 
      chessLevel 
    });
  } catch (err) {
    console.error("Set rating error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

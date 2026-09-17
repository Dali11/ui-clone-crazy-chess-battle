import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIZE_SPLITS_BY_TYPE, DEFAULT_PRIZE_SPLITS } from "@/lib/tournament/prizes";
import { getPlatformConfig } from "@/lib/platform-config";
import { checkCreatorEligibility, escrowFixedPoolPrize, MAX_CREATOR_PROFIT_PERCENT } from "@/lib/tournament/creator-economics";
import { sendEmail } from "@/lib/email";
import { formatMoneyConverted } from "@/lib/geo/server-format";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name, description, type = "swiss", timeControl = "blitz",
      initialMinutes = 5, incrementSeconds = 0, maxPlayers, minPlayers = 2,
      rounds, durationMinutes, startsAt, endsAt,
      entryFee = 0, creatorProfitPercent = 0, minRating = 0, maxRating,
      prizePool = 0, poolSource = "entry_fees",
      thumbnailDataUrl = null,
      knockoutFormat = "pure",
    } = body;

    if (!name || !startsAt) {
      return NextResponse.json({ error: "Tournament name and start time are required" }, { status: 400 });
    }

    const startMs = new Date(startsAt).getTime();
    if (Number.isNaN(startMs) || startMs < Date.now() + 15 * 60 * 1000) {
      return NextResponse.json(
        { error: "Start time must be at least 15 minutes from now" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Check if creator is admin
    const { data: creatorProfile } = await admin
      .from("profiles").select("is_admin, country").eq("id", user.id).single();
    const isCreatorAdmin = creatorProfile?.is_admin ?? false;

    // ─── Load platform config ──────────────────────────────────────────
    const tConfig = await getPlatformConfig(admin, "tournaments");

    // Enforce entry fee limits from platform config
    const fee = Number(entryFee || 0);
    const maxFee = tConfig.max_entry_fee ?? 5000;
    const minFee = tConfig.min_entry_fee ?? 0;
    // Player enters the fee in THEIR OWN currency — the UI converts to MWK
    // before calling us. Quote limits back in their currency (MWK only as
    // fallback when FX is down).
    const feeCountry = creatorProfile?.country;
    if (fee > maxFee) {
      return NextResponse.json({ error: `Entry fee cannot exceed ${await formatMoneyConverted(maxFee, feeCountry)}` }, { status: 400 });
    }
    if (fee < minFee) {
      return NextResponse.json({ error: `Entry fee must be at least ${await formatMoneyConverted(minFee, feeCountry)}` }, { status: 400 });
    }

    // Enforce max players limit from platform settings
    const configMaxPlayers = tConfig.max_players || 128;
    const minP = Number(minPlayers) || 2;
    const maxP = maxPlayers ? Math.min(Number(maxPlayers), configMaxPlayers) : configMaxPlayers;

    if (minP < 2) {
      return NextResponse.json({ error: "Minimum 2 players required" }, { status: 400 });
    }
    if (maxP < minP) {
      return NextResponse.json({ error: "Max players must be greater than or equal to min players" }, { status: 400 });
    }

    const profitPercent = Math.max(0, Math.min(100, Number(creatorProfitPercent) || 0));
    const isPaid = Number(entryFee) > 0;


    const dbType = ["arena", "swiss", "knockout"].includes(type) ? type : "swiss";
    const GAME_TIME_CONTROL_MAP: Record<string, string> = {
      bullet: "bullet", blitz3: "blitz", blitz: "blitz",
      rapid: "rapid", rapid15: "rapid", classical: "classical",
    };
    const dbTimeControl = GAME_TIME_CONTROL_MAP[timeControl] || "blitz";
    const payouts = PRIZE_SPLITS_BY_TYPE[dbType] || DEFAULT_PRIZE_SPLITS;

    // ── Player-created tournaments: qualification + economics guardrails ──
    let finalProfitPercent = profitPercent;
    let escrowAmountMwk = 0;

    if (!isCreatorAdmin) {
      // KYC + platform activity gate
      const eligibility = await checkCreatorEligibility(admin, user.id);
      if (!eligibility.ok) {
        return NextResponse.json({ error: eligibility.reason }, { status: 403 });
      }

      if (poolSource === "entry_fees" && isPaid && profitPercent > MAX_CREATOR_PROFIT_PERCENT) {
        return NextResponse.json(
          { error: `Creator profit is capped at ${MAX_CREATOR_PROFIT_PERCENT}% on player tournaments` },
          { status: 400 }
        );
      }

      if (poolSource === "fixed") {
        // Player-funded prize: escrowed from the creator's wallet at creation.
        // Entry fee is optional (free-entry funded prize is allowed).
        escrowAmountMwk = Number(prizePool) || 0;
        if (escrowAmountMwk <= 0) {
          return NextResponse.json(
            { error: "Fixed prize pool tournaments require a prize amount, funded from your wallet" },
            { status: 400 }
          );
        }
        // Income comes from the entry-fee split at start, not a % of the prize.
        finalProfitPercent = 0;
      }
    }

    // Determine approval status based on platform settings
    const requireApproval = tConfig.require_approval !== false;
    const autoApproveUnder = tConfig.auto_approve_below_players || 0;

    let initialStatus: string;
    if (isCreatorAdmin) {
      initialStatus = "upcoming";
    } else if (requireApproval && !(autoApproveUnder > 0 && maxP <= autoApproveUnder)) {
      initialStatus = "pending_approval";
    } else {
      initialStatus = "upcoming";
    }

    const { data: tournament, error } = await admin
      .from("tournaments")
      .insert({
        name, description: description || null,
        type: dbType, time_control: dbTimeControl,
        initial_minutes: Number(initialMinutes), increment_seconds: Number(incrementSeconds || 0),
        max_players: maxP, min_players: minP,
        rounds: rounds ? Number(rounds) : null,
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        starts_at: startsAt, ends_at: endsAt || null,
        entry_fee: Number(entryFee || 0),
        prize_pool: poolSource === 'fixed' ? (Number(prizePool) || 0) : (isPaid ? 0 : Number(entryFee || 0)),
        pool_source: poolSource === 'fixed' ? 'fixed' : 'entry_fees',
        creator_profit_percent: isPaid ? finalProfitPercent : 0,
        is_player_created: !isCreatorAdmin,
        prize_distribution: { type: "percentage", payouts },
        min_rating: Number(minRating || 0),
        max_rating: maxRating ? Number(maxRating) : null,
        thumbnail_url: thumbnailDataUrl || null,
        knockout_format: knockoutFormat,
        created_by: user.id,
        status: initialStatus,
      })
      .select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Escrow the fixed prize pool from the creator's wallet (players only).
    if (escrowAmountMwk > 0) {
      const escrowErr = await escrowFixedPoolPrize(
        admin,
        tournament.id,
        user.id,
        escrowAmountMwk
      );
      if (escrowErr) {
        // Roll back the tournament row so no unbacked prize can exist.
        await admin.from("tournaments").delete().eq("id", tournament.id);
        return NextResponse.json({ error: escrowErr }, { status: 402 });
      }
    }

    // ── Send announcement emails to all users if tournament is live ──
    let emailsSent = 0;
    if (initialStatus === "upcoming") {
      try {
        const { data: allUsers } = await admin
          .rpc("get_all_user_emails");

        if (allUsers && allUsers.length > 0) {
          const emailPromises = (allUsers as any[])
            .map((u: any) => u.email)
            .filter((e: any): e is string => !!e)
            .map((to: string) =>
              sendEmail({
                to,
                template: "new_tournament" as const,
                data: {
                  tournamentName: name,
                  tournamentId: tournament.id,
                  startsAt,
                  entryFee: Number(entryFee || 0),
                  playerCount: 0,
                  currentPrizePool: poolSource === "fixed" ? Number(prizePool || 0) : 0,
                  tournamentType: dbType,
                  timeControl: dbTimeControl,
                  initialMinutes: Number(initialMinutes),
                  incrementSeconds: Number(incrementSeconds || 0),
                  rounds: rounds ? Number(rounds) : null,
                  durationMinutes: durationMinutes ? Number(durationMinutes) : null,
                  poolSource: poolSource === "fixed" ? "fixed" : "entry_fees",
                  creatorProfitPercent: isPaid ? finalProfitPercent : 0,
                },
              })
            );
          await Promise.allSettled(emailPromises);
          emailsSent = allUsers.length;
        }
      } catch (emailErr) {
        console.error("[tournament-create] Failed to send announcement emails:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      tournament,
      pendingApproval: initialStatus === "pending_approval",
      emailsSent,
      message: initialStatus === "pending_approval"
        ? "Tournament created! It's pending admin approval. You'll be notified once it's approved."
        : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create tournament" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getPlatformConfig } from "@/lib/platform-config";

/**
 * Membership Cleanup — called daily by Vercel cron.
 *
 * Phase 1: Mark memberships as expired (end_date passed, still active)
 *   -> Send membership_expired email with renewal link
 * Phase 2: Enforce grace period — remove from leagues after grace period
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      // Also allow authenticated admin requests
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const adminClient = createAdminClient();
      const { data: profile } = await adminClient.from("profiles").select("is_admin").eq("id", user.id).single();
      if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    const mConfig = await getPlatformConfig(admin, 'membership');
    const gracePeriodDays = mConfig.grace_period_days || 10;

    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - gracePeriodDays * 24 * 60 * 60 * 1000);

    const results = {
      markedExpired: 0,
      removedFromLeagues: 0,
      fixturesForfeited: 0,
      standingsDeleted: 0,
      emailsSent: 0,
      details: [] as any[],
    };

    // PHASE 1: Mark memberships as expired (end_date passed, still active)
    const { data: justExpired, error: expiredErr } = await admin
      .from("memberships")
      .select("id, player_id, end_date")
      .eq("status", "active")
      .lt("end_date", now.toISOString());

    if (expiredErr) throw expiredErr;

    if (justExpired && justExpired.length > 0) {
      const expiredIds = justExpired.map((m) => m.id);
      const { error: updateErr } = await admin
        .from("memberships")
        .update({ status: "expired", updated_at: now.toISOString() })
        .in("id", expiredIds);

      if (!updateErr) {
        results.markedExpired = expiredIds.length;

        // Send membership expired email to each player
        for (const membership of justExpired) {
          try {
            const { data: profile } = await admin
              .from("profiles")
              .select("email, display_name, username")
              .eq("id", membership.player_id)
              .single();

            if (profile?.email) {
              await sendEmail({
                to: profile.email,
                template: "membership_expired",
                data: {
                  displayName: profile.display_name || profile.username || "Player",
                  endDate: membership.end_date,
                  renewalUrl: "https://crazychessbattles.live/membership",
                  gracePeriodDays,
                },
              });
              results.emailsSent++;
            }
          } catch (emailErr) {
            console.error("Membership expired email failed:", emailErr);
          }
        }
      }
    }

    // PHASE 2: Enforce grace period — remove from leagues
    const { data: overdue, error: overdueErr } = await admin
      .from("memberships")
      .select("id, player_id, end_date")
      .eq("status", "expired")
      .lt("end_date", tenDaysAgo.toISOString());

    if (overdueErr) throw overdueErr;

    if (overdue && overdue.length > 0) {
      for (const membership of overdue) {
        const playerId = membership.player_id;

        const { data: leagues } = await admin
          .from("premier_leagues")
          .select("id, name, player_ids, status")
          .contains("player_ids", [playerId]);

        if (!leagues || leagues.length === 0) {
          await admin
            .from("memberships")
            .update({ status: "cancelled", updated_at: now.toISOString() })
            .eq("id", membership.id);
          continue;
        }

        for (const league of leagues) {
          const updatedPlayerIds = (league.player_ids || []).filter(
            (id: string) => id !== playerId
          );

          await admin
            .from("premier_leagues")
            .update({
              player_ids: updatedPlayerIds,
              updated_at: now.toISOString(),
            })
            .eq("id", league.id);

          results.removedFromLeagues++;

          // Forfeit unplayed fixtures
          const { data: unplayedFixtures } = await admin
            .from("league_fixtures")
            .select("id, home_player_id, away_player_id")
            .eq("league_id", league.id)
            .eq("played", false)
            .or(`home_player_id.eq.${playerId},away_player_id.eq.${playerId}`);

          if (unplayedFixtures && unplayedFixtures.length > 0) {
            for (const fixture of unplayedFixtures) {
              const isHome = fixture.home_player_id === playerId;
              const result = isHome ? "away_win" : "home_win";

              await admin
                .from("league_fixtures")
                .update({
                  played: true,
                  result,
                  updated_at: now.toISOString(),
                })
                .eq("id", fixture.id);

              results.fixturesForfeited++;

              const opponentId = isHome
                ? fixture.away_player_id
                : fixture.home_player_id;

              if (opponentId) {
                const { data: standing } = await admin
                  .from("league_standings")
                  .select("id, played, wins, points, form")
                  .eq("league_id", league.id)
                  .eq("player_id", opponentId)
                  .single();

                if (standing) {
                  await admin
                    .from("league_standings")
                    .update({
                      played: (standing.played || 0) + 1,
                      wins: (standing.wins || 0) + 1,
                      points: (standing.points || 0) + 3,
                      form: [...(standing.form || []), "W"].slice(-5),
                      updated_at: now.toISOString(),
                    })
                    .eq("id", standing.id);
                }
              }
            }
          }

          // Delete the expired player's standings row
          const { error: deleteErr } = await admin
            .from("league_standings")
            .delete()
            .eq("league_id", league.id)
            .eq("player_id", playerId);

          if (!deleteErr) results.standingsDeleted++;

          results.details.push({
            playerId,
            leagueId: league.id,
            leagueName: league.name,
            fixturesForfeited: unplayedFixtures?.length || 0,
          });
        }

        await admin
          .from("memberships")
          .update({ status: "cancelled", updated_at: now.toISOString() })
          .eq("id", membership.id);
      }
    }

    if (isCron || results.removedFromLeagues > 0) {
      console.log(
        `[membership-cleanup] ${now.toISOString()}: ` +
        `${results.markedExpired} marked expired, ` +
        `${results.removedFromLeagues} removed from leagues, ` +
        `${results.fixturesForfeited} fixtures forfeited, ` +
        `${results.standingsDeleted} standings deleted, ` +
        `${results.emailsSent} emails sent`
      );
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error("Membership cleanup error:", error);
    return NextResponse.json({ error: error.message || "Cleanup failed" }, { status: 500 });
  }
}

/**
 * Crazy Chess Battles — Branded Email System
 * 
 * Sends beautifully formatted HTML emails matching the platform's dark/purple aesthetic.
 * All test emails are redirected to geniuspulse22@gmail.com via TEST_EMAIL_OVERRIDE.
 * 
 * Usage:
 *   import { sendEmail, sendTournamentEmail } from "@/lib/email";
 *   await sendEmail({ to: user.email, subject: "...", template: "welcome", data: {...} });
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "Crazy Chess Battles <noreply@crazychessbattles.live>";
const BASE_URL = "https://crazychessbattles.live";
const LOGO_URL = `${BASE_URL}/logo-badge.png`;

// All test emails go here during development
const TEST_EMAIL_OVERRIDE = "geniuspulse22@gmail.com";

export interface EmailData {
  to: string;
  subject: string;
  template: EmailTemplate;
  data: Record<string, any>;
}

export type EmailTemplate =
  | "welcome"
  | "password_reset"
  | "deposit_credited"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "tournament_starting_soon"
  | "tournament_round_live"
  | "tournament_finished"
  | "challenge_received"
  | "tournament_registered"
  | "game_result"
  | "tournament_cancelled"
  | "prize_payout"
  | "account_banned"
  | "account_unbanned"
  | "identity_verified"
  | "membership_activated"
  | "membership_expired"
  | "knockout_eliminated";

// ─── Master Template ─────────────────────────────────────────────

function wrapContent(title: string, bodyHtml: string, previewText?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${previewText ? `<meta property="og:title" content="${previewText}">` : ""}
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Inter',system-ui,-apple-system,sans-serif;color:#e2e8f0;">
  <!-- Preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${previewText || title}
  </div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <!-- Email container -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#16161f;border:1px solid #2a2a3a;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="Crazy Chess Battles" width="56" height="56" style="border-radius:12px;margin:0 auto 12px;display:block;width:56px;height:56px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Crazy Chess Battles</h1>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.7);">${title}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a3a;padding-top:20px;">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                      <a href="${BASE_URL}" style="color:#7c3aed;text-decoration:none;font-weight:600;">crazychessbattles.live</a>
                      &nbsp;·&nbsp;
                      <a href="${BASE_URL}/tournaments" style="color:#7c3aed;text-decoration:none;">Tournaments</a>
                      &nbsp;·&nbsp;
                      <a href="${BASE_URL}/leaderboard" style="color:#7c3aed;text-decoration:none;">Leaderboard</a>
                    </p>
                    <p style="margin:0;font-size:11px;color:#6b7280;line-height:1.5;">
                      You received this email because you have an account at Crazy Chess Battles.<br>
                      <a href="${BASE_URL}/settings" style="color:#6b7280;text-decoration:underline;">Manage notification preferences</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Sub-footer -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:16px 0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#4b5563;">
                © 2026 Crazy Chess Battles. All rights reserved.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Button Helper ────────────────────────────────────────────────

function button(href: string, label: string): string {
  return `
  <table cellpadding="0" cellspacing="0" style="margin:24px auto;">
    <tr>
      <td style="background:#7c3aed;border-radius:10px;">
        <a href="${href}" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function infoBox(label: string, value: string, color: string = "#9ca3af"): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;">
    <tr>
      <td style="padding:12px 16px;background:#1c1c28;border:1px solid #2a2a3a;border-radius:10px;">
        <span style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">${label}</span><br>
        <span style="font-size:16px;color:${color};font-weight:600;">${value}</span>
      </td>
    </tr>
  </table>`;
}

function divider(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="border-top:1px solid #2a2a3a;"></td></tr></table>`;
}

// ─── Template Renderers ────────────────────────────────────────────

function renderTemplate(template: EmailTemplate, data: Record<string, any>): { subject: string; body: string; title: string; preview: string } {
  switch (template) {

    case "welcome": {
      return {
        subject: `Welcome to Crazy Chess Battles, ${data.username}! ♟️`,
        title: "Welcome",
        preview: "Your account is ready — let's battle!",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Welcome to the battlefield, ${data.username}! ⚔️</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your account is ready. Join tournaments, challenge players worldwide, and climb the leaderboard.
          </p>
          ${infoBox("Your Username", data.username, "#7c3aed")}
          ${infoBox("Starting Rating", "1200", "#f59e0b")}
          ${button(`${BASE_URL}/tournaments`, "Browse Tournaments")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Tip: Complete your profile to get matched with players at your skill level.</p>
        `,
      };
    }

    case "password_reset": {
      return {
        subject: "Reset your password — Crazy Chess Battles",
        title: "Password Reset",
        preview: "Reset your Crazy Chess Battles password",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Password Reset Request</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            We received a request to reset your password. Click the button below to choose a new one.
          </p>
          ${button(data.resetUrl, "Reset Password")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
        `,
      };
    }

    case "deposit_credited": {
      return {
        subject: `Deposit confirmed — ${data.amount} ${data.currency}`,
        title: "Deposit Confirmed",
        preview: `Your deposit of ${data.amount} ${data.currency} is now in your wallet`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">💰 Deposit Confirmed!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your deposit has been credited to your wallet and is ready to use.
          </p>
          ${infoBox("Amount", `${data.amount} ${data.currency}`, "#10b981")}
          ${infoBox("New Balance", `${data.newBalance} ${data.currency}`, "#f59e0b")}
          ${infoBox("Method", data.method || "Bank Transfer", "#9ca3af")}
          ${button(`${BASE_URL}/wallet`, "View Wallet")}
        `,
      };
    }

    case "withdrawal_approved": {
      return {
        subject: `Withdrawal sent — ${data.amount} ${data.currency}`,
        title: "Withdrawal Approved",
        preview: `Your withdrawal of ${data.amount} ${data.currency} has been sent`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">✅ Withdrawal Approved</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your withdrawal request has been approved and funds are on their way.
          </p>
          ${infoBox("Amount", `${data.amount} ${data.currency}`, "#10b981")}
          ${infoBox("Method", data.method || "Bank Transfer", "#9ca3af")}
          ${infoBox("Reference", data.reference || "N/A", "#9ca3af")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Funds typically arrive within 1-3 business days depending on your bank.</p>
        `,
      };
    }

    case "withdrawal_rejected": {
      return {
        subject: "Withdrawal update — Crazy Chess Battles",
        title: "Withdrawal Update",
        preview: "Your withdrawal request could not be processed",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Withdrawal Update</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Unfortunately, your withdrawal request could not be processed at this time.
          </p>
          ${infoBox("Amount", `${data.amount} ${data.currency}`, "#ef4444")}
          ${infoBox("Reason", data.reason || "Please contact support", "#9ca3af")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">The funds remain in your wallet. You can try again or contact support for help.</p>
          ${button(`${BASE_URL}/wallet`, "Go to Wallet")}
        `,
      };
    }

    case "tournament_starting_soon": {
      return {
        subject: `⏰ ${data.tournamentName} starts in 15 minutes!`,
        title: "Tournament Starting Soon",
        preview: `${data.tournamentName} starts in 15 minutes — get ready!`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">⏰ Starting in 15 Minutes</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your tournament is about to begin. Make sure you're online and ready to play!
          </p>
          ${infoBox("Tournament", data.tournamentName, "#7c3aed")}
          ${infoBox("Start Time", data.startTime, "#f59e0b")}
          ${infoBox("Players", data.playerCount, "#9ca3af")}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "Open Tournament")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Be online when the tournament starts — no-shows may be eliminated.</p>
        `,
      };
    }

    case "tournament_round_live": {
      return {
        subject: `⚔️ Round ${data.round} is live — ${data.tournamentName}`,
        title: "Round Live",
        preview: `Your Round ${data.round} pairing is ready`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">⚔️ Round ${data.round} — You're Up!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your pairing is ready. Head to your game now!
          </p>
          ${infoBox("Tournament", data.tournamentName, "#7c3aed")}
          ${infoBox("Round", `Round ${data.round}`, "#f59e0b")}
          ${infoBox("Opponent", data.opponent || "Bye (auto-advance)", "#9ca3af")}
          ${infoBox("Color", data.color || "TBD", "#9ca3af")}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "Go to Your Game")}
        `,
      };
    }

    case "tournament_finished": {
      return {
        subject: `🏆 ${data.tournamentName} — Final Results`,
        title: "Tournament Finished",
        preview: `Final standings for ${data.tournamentName} are in`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">🏆 Tournament Complete!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            ${data.tournamentName} has finished. Here are the final standings:
          </p>
          ${data.userRank ? `<p style="font-size:16px;color:#7c3aed;font-weight:600;margin:16px 0;">Your Final Rank: #${data.userRank}</p>` : ""}
          ${data.standingsHtml || ""}
          ${data.prizeAmount ? infoBox("Your Prize", `${data.prizeAmount} ${data.currency}`, "#10b981") : ""}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "View Full Results")}
        `,
      };
    }

    case "challenge_received": {
      return {
        subject: `⚔️ ${data.challenger} challenged you to a battle!`,
        title: "New Challenge",
        preview: `${data.challenger} wants to play — accept or decline`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">⚔️ You've Been Challenged!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            <strong style="color:#7c3aed;">${data.challenger}</strong> (Rating: ${data.challengerRating || "1200"}) has challenged you to a chess battle.
          </p>
          ${infoBox("Time Control", data.timeControl || "10+5", "#f59e0b")}
          ${infoBox("Type", data.gameType || "Rated", "#9ca3af")}
          ${button(`${BASE_URL}/battles`, "View Challenge")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Challenges expire if not accepted within a reasonable time.</p>
        `,
      };
    }

    case "tournament_registered": {
      return {
        subject: `✅ Registered for ${data.tournamentName}`,
        title: "Registration Confirmed",
        preview: `You're registered for ${data.tournamentName}`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">✅ You're In!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your registration is confirmed. We'll notify you when the tournament is about to start.
          </p>
          ${infoBox("Tournament", data.tournamentName, "#7c3aed")}
          ${infoBox("Start Time", data.startTime, "#f59e0b")}
          ${infoBox("Entry Fee", data.entryFee ? `${data.entryFee} ${data.currency}` : "Free", "#9ca3af")}
          ${infoBox("Players", `${data.playerCount} registered`, "#9ca3af")}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "View Tournament")}
        `,
      };
    }

    case "game_result": {
      const resultColor = data.result === "win" ? "#10b981" : data.result === "loss" ? "#ef4444" : "#9ca3af";
      const resultText = data.result === "win" ? "Victory! 🎉" : data.result === "loss" ? "Defeat" : "Draw";
      return {
        subject: `${resultText} — ${data.tournamentName ? `Round ${data.round}` : "Battle"} vs ${data.opponent}`,
        title: "Game Result",
        preview: `${resultText} against ${data.opponent}`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:${resultColor};">${resultText}</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            ${data.tournamentName ? `Tournament: ${data.tournamentName} — Round ${data.round}` : "Casual battle"} vs ${data.opponent}
          </p>
          ${infoBox("Result", resultText, resultColor)}
          ${infoBox("Opponent", data.opponent, "#9ca3af")}
          ${data.newRating ? infoBox("New Rating", data.newRating, "#f59e0b") : ""}
          ${data.tournamentId ? button(`${BASE_URL}/tournament/${data.tournamentId}`, "View Tournament") : button(`${BASE_URL}/battles`, "Back to Battles")}
        `,
      };
    }

    case "tournament_cancelled": {
      return {
        subject: `❌ ${data.tournamentName} has been cancelled`,
        title: "Tournament Cancelled",
        preview: `${data.tournamentName} was cancelled — entry fees refunded`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ef4444;">Tournament Cancelled</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Unfortunately, ${data.tournamentName} has been cancelled.
          </p>
          ${infoBox("Tournament", data.tournamentName, "#7c3aed")}
          ${data.refunded ? infoBox("Entry Fee", "Refunded to wallet", "#10b981") : ""}
          ${infoBox("Reason", data.reason || "Insufficient players or admin decision", "#9ca3af")}
          ${button(`${BASE_URL}/tournaments`, "Browse Other Tournaments")}
        `,
      };
    }

    case "prize_payout": {
      return {
        subject: `💰 Prize money received — ${data.amount} ${data.currency}`,
        title: "Prize Payout",
        preview: `You won ${data.amount} ${data.currency} from ${data.tournamentName}`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#10b981;">💰 Prize Money Received!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Congratulations! Your prize money from ${data.tournamentName} has been credited to your wallet.
          </p>
          ${infoBox("Amount", `${data.amount} ${data.currency}`, "#10b981")}
          ${infoBox("Tournament", data.tournamentName, "#7c3aed")}
          ${infoBox("Your Rank", `#${data.rank}`, "#f59e0b")}
          ${infoBox("New Balance", `${data.newBalance} ${data.currency}`, "#9ca3af")}
          ${button(`${BASE_URL}/wallet`, "View Wallet")}
        `,
      };
    }

    case "account_banned": {
      return {
        subject: "Account suspended — Crazy Chess Battles",
        title: "Account Suspended",
        preview: "Your account has been suspended",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ef4444;">Account Suspended</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your Crazy Chess Battles account has been suspended.
          </p>
          ${infoBox("Reason", data.reason || "Violation of community guidelines", "#9ca3af")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">If you believe this is an error, please contact support.</p>
        `,
      };
    }

    case "account_unbanned": {
      return {
        subject: "Account restored — Crazy Chess Battles",
        title: "Account Restored",
        preview: "Your account has been restored — welcome back",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#10b981;">Welcome Back! 🎉</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your Crazy Chess Battles account has been restored. You can log in and play again.
          </p>
          ${button(`${BASE_URL}`, "Back to the Battlefield")}
        `,
      };
    }

    case "identity_verified": {
      return {
        subject: "✅ Identity verified — Crazy Chess Battles",
        title: "Identity Verified",
        preview: "Your identity verification is complete",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#10b981;">✅ Verified!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your identity has been verified. You now have full access to all platform features including withdrawals.
          </p>
          ${button(`${BASE_URL}/wallet`, "Go to Wallet")}
        `,
      };
    }

    case "membership_activated": {
      return {
        subject: ` membership is active! 🎟️`,
        title: "Membership Active",
        preview: `Your membership is now active`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#7c3aed;">🎟️ Membership Active!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your ${data.planName || "membership"} is now active. Enjoy exclusive tournaments and features!
          </p>
          ${infoBox("Plan", data.planName || "Premium", "#7c3aed")}
          ${data.expiresAt ? infoBox("Valid Until", data.expiresAt, "#f59e0b") : ""}
          ${button(`${BASE_URL}/tournaments`, "Browse Member Tournaments")}
        `,
      };
    }

    case "membership_expired": {
      return {
        subject: "Your membership has expired — Crazy Chess Battles",
        title: "Membership Expired",
        preview: "Renew to keep your member benefits",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#f59e0b;">Membership Expired</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your ${data.planName || "membership"} has expired. Renew to keep access to exclusive tournaments and features.
          </p>
          ${button(`${BASE_URL}/membership`, "Renew Membership")}
        `,
      };
    }

    case "knockout_eliminated": {
      return {
        subject: `Eliminated from ${data.tournamentName} — Crazy Chess Battles`,
        title: "Eliminated",
        preview: `You were eliminated in Round ${data.round}`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ef4444;">Eliminated</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            You were eliminated from ${data.tournamentName} in Round ${data.round}. GG!
          </p>
          ${infoBox("Tournament", data.tournamentName, "#7c3aed")}
          ${infoBox("Eliminated in", `Round ${data.round}`, "#ef4444")}
          ${infoBox("Opponent", data.opponent || "N/A", "#9ca3af")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">You can still watch the remaining rounds and join other tournaments.</p>
          ${button(`${BASE_URL}/tournaments`, "Find More Tournaments")}
        `,
      };
    }

    default:
      return {
        subject: data.subject || "Crazy Chess Battles Notification",
        title: "Notification",
        preview: "You have a new notification",
        body: `<p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.6;">${data.message || "You have a new update on your account."}</p>`,
      };
  }
}

// ─── Send Function ─────────────────────────────────────────────────

export async function sendEmail(email: EmailData): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email send");
    return false;
  }

  const rendered = renderTemplate(email.template, email.data);
  
  // Override recipient for test mode
  const to = TEST_EMAIL_OVERRIDE;
  const isOverridden = email.to !== TEST_EMAIL_OVERRIDE;

  const html = wrapContent(rendered.title, rendered.body, rendered.preview);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject: isOverridden ? `[TEST→${email.to}] ${rendered.subject}` : rendered.subject,
        html,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("[email] Resend API error:", error);
      return false;
    }

    const result = await res.json();
    console.log(`[email] Sent to ${to}${isOverridden ? ` (overridden from ${email.to})` : ""} — id: ${result.id}`);
    return true;
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return false;
  }
}

// ─── Batch Send ────────────────────────────────────────────────────

export async function sendBatchEmails(emails: EmailData[]): Promise<void> {
  await Promise.allSettled(emails.map((e) => sendEmail(e)));
}

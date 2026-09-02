/**
 * Crazy Chess Battles — Branded Email System
 * 
 * Sends beautifully formatted HTML emails matching the platform's dark/purple aesthetic.
 * All test emails are redirected to geniuspulse22@gmail.com via TEST_EMAIL_OVERRIDE.
 * 
 * Usage:
 *   import { sendEmail } from "@/lib/email";
 *   await sendEmail({ to: user.email, subject: "...", template: "welcome", data: {...} });
 *
 * The `subject` passed at the call site is used as-is. If not provided or empty,
 * the template's default subject is used. This lets each route craft a precise
 * subject with real data (player names, amounts, tournament names, etc.).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "Crazy Chess Battles <noreply@crazychessbattles.live>";
const BASE_URL = "https://crazychessbattles.live";
const LOGO_URL = `${BASE_URL}/logo-badge.png`;

// Set to a valid email to force ALL sends there (dev/testing only). Leave null for real sending.
const TEST_EMAIL_OVERRIDE: string | null = null;

export interface EmailData {
  to: string;
  subject?: string; // If provided, overrides the template's default subject
  template: EmailTemplate;
  data: Record<string, any>;
}

export type EmailTemplate =
  | "welcome"
  | "password_reset"
  | "deposit_credited"
  | "deposit_rejected"
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
  | "knockout_eliminated"
  | "new_tournament"
  | "tournament_reminder";

// ─── Helper: Format MWK amounts ────────────────────────────────────

function formatMWK(amount: number): string {
  return `MK ${amount.toLocaleString()}`;
}

// ─── Helper: Convert ISO time to CAT display ───────────────────────

function formatCAT(isoString: string): string {
  if (!isoString) return "TBD";
  try {
    const d = new Date(isoString);
    return d.toLocaleString("en-GB", {
      timeZone: "Africa/Blantyre",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " CAT";
  } catch {
    return isoString;
  }
}

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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${previewText || title}
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#16161f;border:1px solid #2a2a3a;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="Crazy Chess Battles" width="56" height="56" style="border-radius:12px;margin:0 auto 12px;display:block;width:56px;height:56px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Crazy Chess Battles</h1>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.7);">${title}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a3a;padding-top:20px;">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                      <a href="${BASE_URL}" style="color:#7c3aed;text-decoration:none;font-weight:600;">crazychessbattles.live</a>
                      &nbsp;\u00b7&nbsp;
                      <a href="${BASE_URL}/tournaments" style="color:#7c3aed;text-decoration:none;">Tournaments</a>
                      &nbsp;\u00b7&nbsp;
                      <a href="${BASE_URL}/league" style="color:#7c3aed;text-decoration:none;">Leagues</a>
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
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:16px 0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#4b5563;">
                \u00a9 2026 Crazy Chess Battles. All rights reserved.
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
      const rating = data.rating || 1200;
      return {
        subject: `Welcome to Crazy Chess Battles, ${data.username || "Player"}! \u265f\ufe0f`,
        title: "Welcome",
        preview: "Your account is ready \u2014 let's battle!",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Welcome to the battlefield, ${data.username || "Player"}! \u2694\ufe0f</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your account is ready. Join tournaments, challenge players worldwide, and climb the league standings.
          </p>
          ${infoBox("Your Username", data.username || "Player", "#7c3aed")}
          ${infoBox("Starting Rating", String(rating), "#f59e0b")}
          ${button(`${BASE_URL}/tournaments`, "Browse Tournaments")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Tip: Complete your profile to get matched with players at your skill level.</p>
        `,
      };
    }

    case "password_reset": {
      return {
        subject: "Reset your password \u2014 Crazy Chess Battles",
        title: "Password Reset",
        preview: "Reset your Crazy Chess Battles password",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Password Reset Request</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            We received a request to reset your password. Click the button below to choose a new one.
          </p>
          ${button(data.resetUrl || `${BASE_URL}/reset-password`, "Reset Password")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
        `,
      };
    }

    case "deposit_credited": {
      const amount = data.amount || formatMWK(data.amount || 0);
      const currency = data.currency || "MWK";
      const balance = data.newBalance || data.walletBalance || "\u2014";
      return {
        subject: `Deposit confirmed \u2014 ${amount} ${currency}`,
        title: "Deposit Confirmed",
        preview: `Your deposit of ${amount} ${currency} is now in your wallet`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">\ud83d\udcb0 Deposit Confirmed!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your deposit has been credited to your wallet and is ready to use.
          </p>
          ${infoBox("Amount", `${amount} ${currency}`, "#10b981")}
          ${infoBox("New Balance", `${balance} ${currency}`, "#f59e0b")}
          ${infoBox("Method", data.method || "Bank Transfer", "#9ca3af")}
          ${button(`${BASE_URL}/wallet`, "View Wallet")}
        `,
      };
    }

    case "deposit_rejected": {
      const amount = data.amount || formatMWK(data.amount || 0);
      const currency = data.currency || "MWK";
      return {
        subject: `Deposit update \u2014 ${amount} ${currency} could not be processed`,
        title: "Deposit Update",
        preview: "Your deposit could not be processed",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ef4444;">Deposit Update</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Unfortunately, your deposit could not be processed at this time.
          </p>
          ${infoBox("Amount", `${amount} ${currency}`, "#ef4444")}
          ${infoBox("Reason", data.reason || "Could not be verified", "#9ca3af")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">You can try submitting a new deposit request or contact support for help.</p>
          ${button(`${BASE_URL}/wallet`, "Go to Wallet")}
        `,
      };
    }

    case "withdrawal_approved": {
      const amount = data.amount || formatMWK(data.amount || 0);
      const currency = data.currency || "MWK";
      return {
        subject: `Withdrawal sent \u2014 ${amount} ${currency}`,
        title: "Withdrawal Approved",
        preview: `Your withdrawal of ${amount} ${currency} has been sent`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">\u2705 Withdrawal Approved</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your withdrawal request has been approved and funds are on their way.
          </p>
          ${infoBox("Amount", `${amount} ${currency}`, "#10b981")}
          ${infoBox("Sent To", data.phone || data.recipient || "Your account", "#9ca3af")}
          ${infoBox("Method", data.operator || data.method || "Bank Transfer", "#9ca3af")}
          ${data.reference ? infoBox("Reference", data.reference, "#9ca3af") : ""}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Funds typically arrive within 1-3 business days depending on your bank or mobile money provider.</p>
        `,
      };
    }

    case "withdrawal_rejected": {
      const amount = data.amount || formatMWK(data.amount || 0);
      const currency = data.currency || "MWK";
      return {
        subject: `Withdrawal update \u2014 ${amount} ${currency}`,
        title: "Withdrawal Update",
        preview: "Your withdrawal request could not be processed",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Withdrawal Update</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Unfortunately, your withdrawal request could not be processed at this time.
          </p>
          ${infoBox("Amount", `${amount} ${currency}`, "#ef4444")}
          ${infoBox("Reason", data.reason || "Please contact support", "#9ca3af")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">The funds remain in your wallet. You can try again or contact support for help.</p>
          ${button(`${BASE_URL}/wallet`, "Go to Wallet")}
        `,
      };
    }

    case "tournament_starting_soon": {
      return {
        subject: `\u23f0 ${data.tournamentName || "Your tournament"} starts in 15 minutes!`,
        title: "Tournament Starting Soon",
        preview: `${data.tournamentName || "Tournament"} starts in 15 minutes \u2014 get ready!`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">\u23f0 Starting in 15 Minutes</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your tournament is about to begin. Make sure you're online and ready to play!
          </p>
          ${infoBox("Tournament", data.tournamentName || "Tournament", "#7c3aed")}
          ${infoBox("Start Time", data.startTime || formatCAT(data.startsAt), "#f59e0b")}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "Open Tournament")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Be online when the tournament starts \u2014 no-shows may be eliminated.</p>
        `,
      };
    }

    case "tournament_round_live": {
      return {
        subject: `\u2694\ufe0f Round ${data.round || 1} is live \u2014 ${data.tournamentName || "Tournament"}`,
        title: "Round Live",
        preview: `Your Round ${data.round || 1} pairing is ready`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">\u2694\ufe0f Round ${data.round || 1} \u2014 You're Up!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your pairing is ready. Head to your game now!
          </p>
          ${infoBox("Tournament", data.tournamentName || "Tournament", "#7c3aed")}
          ${infoBox("Round", `Round ${data.round || 1}`, "#f59e0b")}
          ${data.opponent ? infoBox("Opponent", `${data.opponent} (${data.opponentRating ? data.opponentRating : "???"})`, "#9ca3af") : infoBox("Opponent", "Bye (auto-advance)", "#9ca3af")}
          ${data.color ? infoBox("Your Color", data.color === "white" ? "White \u2654" : data.color === "black" ? "Black \u265a" : data.color, "#9ca3af") : ""}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "Go to Your Game")}
        `,
      };
    }

    case "tournament_finished": {
      return {
        subject: `\ud83c\udfc6 ${data.tournamentName || "Tournament"} \u2014 Final Results`,
        title: "Tournament Finished",
        preview: `Final standings for ${data.tournamentName || "tournament"} are in`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">\ud83c\udfc6 Tournament Complete!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            ${data.tournamentName || "Tournament"} has finished. Here are the final standings:
          </p>
          ${data.userRank ? `<p style="font-size:16px;color:#7c3aed;font-weight:600;margin:16px 0;">Your Final Rank: #${data.userRank}</p>` : ""}
          ${data.standingsHtml || ""}
          ${data.prizeAmount ? infoBox("Your Prize", `${data.prizeAmount} ${data.currency || "MWK"}`, "#10b981") : ""}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "View Full Results")}
        `,
      };
    }

    case "challenge_received": {
      return {
        subject: `\u2694\ufe0f ${data.challenger || "A player"} challenged you to a battle!`,
        title: "New Challenge",
        preview: `${data.challenger || "Player"} wants to play \u2014 accept or decline`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">\u2694\ufe0f You've Been Challenged!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            <strong style="color:#7c3aed;">${data.challenger || "A player"}</strong> (Rating: ${data.challengerRating || "1200"}) has challenged you to a chess battle.
          </p>
          ${infoBox("Time Control", data.timeControl || "10+5", "#f59e0b")}
          ${infoBox("Type", data.gameType || "Rated", "#9ca3af")}
          ${infoBox("Stake", data.stake ? formatMWK(data.stake) : "Free", "#9ca3af")}
          ${button(`${BASE_URL}/battles`, "View Challenge")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Challenges expire if not accepted within a reasonable time.</p>
        `,
      };
    }

    case "tournament_registered": {
      return {
        subject: `\u2705 Registered for ${data.tournamentName || "Tournament"}`,
        title: "Registration Confirmed",
        preview: `You're registered for ${data.tournamentName || "tournament"}`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">\u2705 You're In!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your registration is confirmed. We'll notify you when the tournament is about to start.
          </p>
          ${infoBox("Tournament", data.tournamentName || "Tournament", "#7c3aed")}
          ${infoBox("Start Time", data.startTime || formatCAT(data.startsAt), "#f59e0b")}
          ${infoBox("Entry Fee", data.entryFee ? formatMWK(data.entryFee) : "Free", "#9ca3af")}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "View Tournament")}
        `,
      };
    }

    case "game_result": {
      const resultColor = data.result === "win" ? "#10b981" : data.result === "loss" ? "#ef4444" : "#9ca3af";
      const resultText = data.result === "win" ? "Victory! \ud83c\udf89" : data.result === "loss" ? "Defeat" : "Draw";
      const contextLabel = data.tournamentName ? `${data.tournamentName} \u2014 Round ${data.round || 1}` : "Casual Battle";
      return {
        subject: `${resultText} \u2014 ${contextLabel} vs ${data.opponent || "Player"}`,
        title: "Game Result",
        preview: `${resultText} against ${data.opponent || "player"}`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:${resultColor};">${resultText}</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            ${contextLabel} vs ${data.opponent || "Player"}
          </p>
          ${infoBox("Result", resultText, resultColor)}
          ${infoBox("Opponent", `${data.opponent || "Player"} (${data.opponentRating || "???"})`, "#9ca3af")}
          ${data.ratingChange ? infoBox("Rating Change", `${data.ratingChange > 0 ? "+" : ""}${data.ratingChange}`, resultColor) : ""}
          ${data.newRating ? infoBox("New Rating", String(data.newRating), "#f59e0b") : ""}
          ${data.tournamentId ? button(`${BASE_URL}/tournament/${data.tournamentId}`, "View Tournament") : button(`${BASE_URL}/battles`, "Back to Battles")}
        `,
      };
    }

    case "tournament_cancelled": {
      return {
        subject: `\u274c ${data.tournamentName || "Tournament"} has been cancelled`,
        title: "Tournament Cancelled",
        preview: `${data.tournamentName || "Tournament"} was cancelled${data.refunded ? " \u2014 entry fees refunded" : ""}`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ef4444;">Tournament Cancelled</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Unfortunately, ${data.tournamentName || "the tournament"} has been cancelled.
          </p>
          ${infoBox("Tournament", data.tournamentName || "Tournament", "#7c3aed")}
          ${data.refunded ? infoBox("Entry Fee", "Refunded to wallet", "#10b981") : ""}
          ${infoBox("Reason", data.reason || "Insufficient players or admin decision", "#9ca3af")}
          ${button(`${BASE_URL}/tournaments`, "Browse Other Tournaments")}
        `,
      };
    }

    case "prize_payout": {
      const amount = data.amount || formatMWK(data.amount || 0);
      const currency = data.currency || "MWK";
      return {
        subject: `\ud83d\udcb0 Prize money received \u2014 ${amount} ${currency}`,
        title: "Prize Payout",
        preview: `You won ${amount} ${currency} from ${data.tournamentName || "tournament"}`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#10b981;">\ud83d\udcb0 Prize Money Received!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Congratulations! Your prize money from ${data.tournamentName || "the tournament"} has been credited to your wallet.
          </p>
          ${infoBox("Tournament", data.tournamentName || "Tournament", "#7c3aed")}
          ${infoBox("Your Rank", `#${data.rank || 1}`, "#f59e0b")}
          ${infoBox("Prize Amount", `${amount} ${currency}`, "#10b981")}
          ${data.newBalance ? infoBox("New Balance", `${data.newBalance} ${currency}`, "#9ca3af") : ""}
          ${button(`${BASE_URL}/wallet`, "View Wallet")}
        `,
      };
    }

    case "account_banned": {
      return {
        subject: "Account suspended \u2014 Crazy Chess Battles",
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
        subject: "Account restored \u2014 Crazy Chess Battles",
        title: "Account Restored",
        preview: "Your account has been restored \u2014 welcome back",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#10b981;">Welcome Back! \ud83c\udf89</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your Crazy Chess Battles account has been restored. You can log in and play again.
          </p>
          ${button(`${BASE_URL}`, "Back to the Battlefield")}
        `,
      };
    }

    case "identity_verified": {
      return {
        subject: "\u2705 Identity verified \u2014 Crazy Chess Battles",
        title: "Identity Verified",
        preview: "Your identity verification is complete",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#10b981;">\u2705 Verified!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your identity has been verified. You now have full access to all platform features including withdrawals.
          </p>
          ${button(`${BASE_URL}/wallet`, "Go to Wallet")}
        `,
      };
    }

    case "membership_activated": {
      const planName = data.planName || "CrazyChess Club";
      return {
        subject: `Your ${planName} membership is active! \ud83c\udf9f\ufe0f`,
        title: "Membership Active",
        preview: `Your ${planName} membership is now active`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#7c3aed;">\ud83c\udf9f\ufe0f Membership Active!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your ${planName} is now active. Enjoy exclusive tournaments and features!
          </p>
          ${infoBox("Plan", planName, "#7c3aed")}
          ${data.expiresAt ? infoBox("Valid Until", data.expiresAt, "#f59e0b") : ""}
          ${button(`${BASE_URL}/tournaments`, "Browse Member Tournaments")}
        `,
      };
    }

    case "membership_expired": {
      return {
        subject: "Your membership has expired \u2014 Crazy Chess Battles",
        title: "Membership Expired",
        preview: "Renew to keep your member benefits",
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#f59e0b;">Membership Expired</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            Your ${data.planName || "membership"} has expired. Renew to keep access to exclusive tournaments and features.
          </p>
          ${button(`${BASE_URL}/league/subscribe`, "Renew Membership")}
        `,
      };
    }

    case "knockout_eliminated": {
      return {
        subject: `Eliminated from ${data.tournamentName || "Tournament"} \u2014 Crazy Chess Battles`,
        title: "Eliminated",
        preview: `You were eliminated in Round ${data.round || "?"}`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ef4444;">Eliminated</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            You were eliminated from ${data.tournamentName || "the tournament"} in Round ${data.round || "?"}. GG!
          </p>
          ${infoBox("Tournament", data.tournamentName || "Tournament", "#7c3aed")}
          ${infoBox("Eliminated in", `Round ${data.round || "?"}`, "#ef4444")}
          ${data.opponent ? infoBox("Eliminated by", data.opponent, "#9ca3af") : ""}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">You can still watch the remaining rounds and join other tournaments.</p>
          ${button(`${BASE_URL}/tournaments`, "Find More Tournaments")}
        `,
      };
    }

    case "new_tournament": {
      return {
        subject: `\ud83c\udfc6 New tournament: ${data.tournamentName || "Tournament"} \u2014 90% Prize Pool!`,
        title: "New Tournament",
        preview: `${data.tournamentName || "A new tournament"} is open for registration`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">\u2694\ufe0f ${data.tournamentName || "New Tournament"} is Live!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            A new tournament just opened for registration. 90% of every entry fee goes straight into the prize pool \u2014 the more players join, the bigger the pot!
          </p>
          ${infoBox("Tournament", data.tournamentName || "Tournament", "#7c3aed")}
          ${infoBox("Starts", data.startTime || formatCAT(data.startsAt), "#f59e0b")}
          ${infoBox("Entry Fee", formatMWK(data.entryFee || 0), "#9ca3af")}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "Join Now")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">MK500 entry \u2014 5-round Swiss, rapid 10+0. Register before it fills up!</p>
        `,
      };
    }

    case "tournament_reminder": {
      return {
        subject: `\u23f0 ${data.tournamentName || "Tournament"} starts in 5 hours \u2014 join now!`,
        title: "Tournament Starting Soon",
        preview: `${data.tournamentName || "Tournament"} starts in 5 hours \u2014 you haven\u2019t joined yet`,
        body: `
          <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">\u23f0 ${data.tournamentName || "Tournament"} starts in 5 hours</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
            A tournament is starting soon and you haven\u2019t joined yet. 90% of every entry fee goes straight into the prize pool \u2014 the more players, the bigger the pot!
          </p>
          ${infoBox("Tournament", data.tournamentName || "Tournament", "#7c3aed")}
          ${infoBox("Starts", data.startTime || formatCAT(data.startsAt), "#f59e0b")}
          ${infoBox("Entry Fee", formatMWK(data.entryFee || 0), "#9ca3af")}
          ${button(`${BASE_URL}/tournament/${data.tournamentId}`, "Join Now")}
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">MK500 entry \u2014 5-round Swiss, rapid 10+0. Don\u2019t miss out!</p>
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
    console.warn("[email] RESEND_API_KEY not set \u2014 skipping email send");
    return false;
  }

  const rendered = renderTemplate(email.template, email.data);

  // Use the subject passed at the call site if provided, otherwise fall back to template default
  const finalSubject = email.subject && email.subject.trim() ? email.subject : rendered.subject;

  // Override recipient only if TEST_EMAIL_OVERRIDE is explicitly set
  const to = TEST_EMAIL_OVERRIDE || email.to;
  const isOverridden = !!TEST_EMAIL_OVERRIDE && email.to !== TEST_EMAIL_OVERRIDE;

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
        subject: isOverridden ? `[TEST\u2192${email.to}] ${finalSubject}` : finalSubject,
        html,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("[email] Resend API error:", error);
      return false;
    }

    const result = await res.json();
    console.log(`[email] Sent to ${to}${isOverridden ? ` (overridden from ${email.to})` : ""} \u2014 id: ${result.id}`);
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

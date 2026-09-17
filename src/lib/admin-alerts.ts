/**
 * Crazy Chess Battles — Admin money alerts.
 *
 * Notifies platform admins (email + web push + in-app admin_notifications
 * row) when money moves in or out of the platform:
 *   - successful deposits (auto-confirmed via provider webhooks)
 *   - successful withdrawals (payout confirmed terminal by provider
 *     callback or the reconciliation sweep)
 *
 * Fire-and-forget by design: every channel is wrapped so a failure can
 * never break the payment flow that triggered it. Admins receive pushes
 * on devices they subscribed with their own admin accounts through the
 * normal /api/push/subscribe flow.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface MoneyEvent {
  kind: "deposit_success" | "withdrawal_success";
  playerName: string;
  amount: number;          // USD-normalised platform amount
  amountLocal?: number | null;
  currency?: string | null;
  method: string;          // pawapay | mobile_money | card | …
  country?: string | null;
  reference?: string | null;
  txId?: string;
}

const fmtMoney = (e: MoneyEvent) => {
  const local = e.amountLocal != null ? e.amountLocal : e.amount;
  const cur = e.currency || "MWK";
  return `${Math.round(local).toLocaleString()} ${cur}`;
};

const isDeposit = (e: MoneyEvent) => e.kind === "deposit_success";

/** Never throws. Emails every admin via Resend when configured. */
async function emailAdmins(admin: SupabaseClient, emails: string[], e: MoneyEvent) {
  const key = process.env.RESEND_API_KEY;
  if (!key || emails.length === 0) return;
  const deposit = isDeposit(e);
  const accent = deposit ? "#10b981" : "#f43f5e";
  const icon = deposit ? "💵" : "💸";
  const heading = deposit ? "Deposit confirmed" : "Withdrawal paid out";
  const ctaHref = deposit
    ? "https://crazychessbattles.live/commandcentre"
    : "https://crazychessbattles.live/commandcentre";
  const rows = [
    ["Player", e.playerName],
    ["Amount", fmtMoney(e)],
    [deposit ? "Money in" : "Money out", deposit ? "Wallet credited" : "Sent to mobile money"],
    ["Method", e.method],
    ...(e.country ? [["Country", e.country]] : []),
    ...(e.reference ? [["Reference", e.reference]] : []),
  ];
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CCB Alerts <alerts@crazychessbattles.live>",
        to: emails,
        subject: `${icon} ${deposit ? "Deposit" : "Withdrawal"} ${fmtMoney(e)} — ${e.playerName}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#e2e8f0;padding:24px;border-radius:12px;border:1px solid #2a2a3a">
  <div style="text-align:center;margin-bottom:20px">
    <span style="font-size:32px">${icon}</span>
    <h2 style="color:${accent};margin:8px 0">${heading}</h2>
  </div>
  <table style="width:100%;font-size:14px;margin:16px 0">
    ${rows.map(([k, v]) => `<tr><td style="color:#9ca3af;padding:4px 12px 4px 0">${k}</td><td style="color:#fff;font-weight:600">${v}</td></tr>`).join("")}
  </table>
  <p style="font-size:13px;color:#9ca3af;margin-top:20px">${deposit
    ? "A provider webhook auto-confirmed this deposit and the player's wallet was credited."
    : "The provider confirmed this payout as terminal and the player has been notified."}</p>
  <div style="text-align:center;margin-top:16px">
    <a href="${ctaHref}" style="background:#7c3aed;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open Command Centre</a>
  </div>
</div>`,
      }),
    });
  } catch {}
}

/** Notify all admins about a successful deposit or withdrawal. Never throws. */
export async function notifyAdminsMoneyEvent(
  admin: SupabaseClient,
  event: MoneyEvent
): Promise<void> {
  try {
    const { data: admins } = await admin
      .from("profiles")
      .select("id, email, username, display_name")
      .eq("is_admin", true)
      .limit(10);
    if (!admins || admins.length === 0) return;

    const deposit = isDeposit(event);
    const amountStr = fmtMoney(event);
    const title = deposit
      ? `Deposit confirmed: ${amountStr}`
      : `Withdrawal paid out: ${amountStr}`;
    const message = deposit
      ? `${event.playerName} deposited ${amountStr} via ${event.method}${event.country ? ` (${event.country})` : ""} — wallet credited automatically.`
      : `${event.playerName} withdrew ${amountStr} via ${event.method}${event.country ? ` (${event.country})` : ""} — payout confirmed by the provider.`;

    // 1) In-app admin notification rows
    for (const a of admins) {
      try {
        await admin.from("admin_notifications").insert({
          type: event.kind,
          title,
          message,
          read: false,
          ...(event.txId ? { target_type: deposit ? "deposit" : "withdrawal", target_id: event.txId } : {}),
        });
      } catch {}
    }

    // 2) Web push to every subscribed admin device
    try {
      const { sendPushToUsers } = await import("@/lib/push/send");
      await sendPushToUsers(
        admin,
        admins.map((a: any) => a.id),
        {
          title,
          body: message,
          url: "https://crazychessbattles.live/commandcentre",
          tag: `admin-${event.kind}`,
        },
        { notifKey: `admin-${event.kind}` }
      );
    } catch {}

    // 3) Email
    const emails = admins.map((a: any) => a.email).filter(Boolean);
    await emailAdmins(admin, emails, event);
  } catch (err: any) {
    console.error(`admin money alert (${event.kind}) failed:`, err?.message);
  }
}

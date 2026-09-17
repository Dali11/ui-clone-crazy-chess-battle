/**
 * PawaPay correspondent auto-detection from MSISDN prefix.
 *
 * Why this exists: the wallet UI lets players pick their mobile money
 * provider from a grid, and a mismatch routes the payment to the wrong
 * network. PawaPay then rejects it with PAYER_NOT_FOUND ("The payer does
 * not have an account with '<CORRESPONDENT>' or it is not active") — seen
 * live 2026-09-17: an MTN Zambia number (0767…) sent as ZAMTEL_ZMB, four
 * failed ZMW 1,000 deposit attempts.
 *
 * Returns the PawaPay correspondent code for confident prefixes, or null
 * for unknown ones — callers keep the player's manual selection when we
 * can't tell. Only ranges verified against each carrier's own number
 * allocations are mapped; an uncertain prefix must stay null.
 *
 * Prefix sources: ZICTA numbering plan + carrier announcements
 * (Airtel Zambia launched 077 alongside 097; MTN holds 096/076;
 * Zamtel holds 095 incl. the 0950-0954 ranges).
 */

// local-prefix → PawaPay correspondent, per country (ISO2 or ISO3)
const ZAMBIAN_PREFIXES: Record<string, string> = {
  "096": "MTN_MOMO_ZMB",
  "076": "MTN_MOMO_ZMB",
  "097": "AIRTEL_OAPI_ZMB",
  "077": "AIRTEL_OAPI_ZMB",
  "095": "ZAMTEL_ZMB", // covers 0950-0954 Zamtel ranges too
};

// Safaricom holds 070/071/072/074 and the 01xx series; Airtel Kenya's
// exact PawaPay correspondent code is not yet confirmed in production, so
// non-Safaricom Kenyan prefixes stay null (player's selection is kept).
const KENYAN_SAFARICOM_PREFIXES: Record<string, string> = {
  "070": "MPESA_KEN",
  "071": "MPESA_KEN",
  "072": "MPESA_KEN",
  "074": "MPESA_KEN",
  "011": "MPESA_KEN",
  "012": "MPESA_KEN",
  "013": "MPESA_KEN",
};

function toLocalMsisdn(digits: string, dialingCode: string): string | null {
  if (digits.startsWith(dialingCode)) return "0" + digits.slice(dialingCode.length);
  if (digits.startsWith("0")) return digits;
  if (digits.length >= 9) return "0" + digits; // already local without leading 0
  return null;
}

/**
 * Detect the PawaPay correspondent for a phone number.
 * @param country ISO2/ISO3 country code ("ZM"/"ZMB", "KE"/"KEN")
 * @param phone any phone format (+260…, 260…, 0767…)
 * @returns correspondent code (e.g. "MTN_MOMO_ZMB") or null when unknown
 */
export function detectPawaPayCorrespondent(
  country: string | null | undefined,
  phone: string
): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;

  const c = (country || "").toUpperCase();
  let local: string | null = null;
  let map: Record<string, string> | null = null;

  if (c === "ZM" || c === "ZMB") {
    local = toLocalMsisdn(digits, "260");
    map = ZAMBIAN_PREFIXES;
  } else if (c === "KE" || c === "KEN") {
    local = toLocalMsisdn(digits, "254");
    map = KENYAN_SAFARICOM_PREFIXES;
  } else {
    return null;
  }

  if (!local || !map) return null;
  for (const prefix of Object.keys(map)) {
    if (local.startsWith(prefix)) return map[prefix];
  }
  return null;
}

/** Human-readable names for ledger display (withdrawals.operator_name). */
export const PAWAPAY_CORRESPONDENT_NAMES: Record<string, string> = {
  MTN_MOMO_ZMB: "MTN MoMo",
  AIRTEL_OAPI_ZMB: "Airtel Money",
  ZAMTEL_ZMB: "Zamtel Kwacha",
  MPESA_KEN: "M-Pesa",
};

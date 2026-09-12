import { redirect } from "next/navigation";

// Old membership URL (pre-Sep 2026 emails, WhatsApp shares, Google index).
// Membership now lives at /membership — this keeps every old link working.
export default function LeagueSubscribePage() {
  redirect("/membership");
}

-- 055: exactly-once DB backstop for tournament prize payouts (berry + cash).
--
-- Companion to the app-level claim in lib/tournament/prizes.ts: the audit
-- deposit row for a payout is inserted BEFORE credit_wallet, and this
-- unique index makes that insert the claim — a race between the finish
-- cron, advance-round auto-finish, the manual finish route and the admin
-- force-finish can no longer double-credit a winner's wallet.
--
-- Scoped precisely to payout refs so legitimate repeatable references are
-- untouched (tournament:{id}:entry and tournament:{id}:refund:... rows
-- are per-player and do NOT match ':rank:').
--
-- Verified against production on 2026-09-11 before applying: 29 payout
-- rows, zero duplicate references.

CREATE UNIQUE INDEX IF NOT EXISTS deposits_tournament_payout_unique
  ON deposits (reference)
  WHERE reference LIKE 'tournament:%:rank:%';

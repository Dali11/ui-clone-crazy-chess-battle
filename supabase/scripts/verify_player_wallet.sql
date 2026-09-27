-- ============================================================
-- Player wallet verification — stored balance vs ledger-derived
-- Run in Supabase Dashboard → SQL Editor (read-only, safe).
-- Matches the Command Centre Player Dossier math (post-096):
--   * membership rows never move the wallet (excluded)
--   * battle_escrow / battle_challenge_escrow are stored positive
--     but lock money away (sign-flipped)
--   * withdrawals are debited at REQUEST time (pending, approved
--     and completed all count; rejected ones were refunded)
--   * withdrawals are stored in the player's LOCAL currency and
--     normalized to MWK with the current rate (pre-080 rows were
--     already MWK and rate = 1 for MWK wallets)
-- ============================================================

-- >>> Change the name filter here, then run <<<
WITH match AS (
  SELECT id, username, display_name, country, wallet_balance,
         public.wallet_currency(id) AS cur
  FROM public.profiles
  WHERE username ILIKE '%mulenga%'
     OR display_name ILIKE '%mulenga%'
),
dep AS (
  SELECT m.id,
         COALESCE(SUM(
           CASE WHEN d.method = 'membership_purchase' THEN 0
                WHEN d.method IN ('battle_escrow', 'battle_challenge_escrow') THEN -abs(d.amount)
                ELSE d.amount
           END
         ), 0) AS mwk
  FROM match m
  JOIN public.deposits d ON d.user_id = m.id
  WHERE d.status = 'success'
  GROUP BY m.id
),
wd AS (
  SELECT m.id, COALESCE(SUM(
           CASE WHEN w.status IN ('pending', 'approved', 'completed')
                THEN w.amount / public.mwk_rate(w.user_id)
                ELSE 0 END
         ), 0) AS withdrawn_mwk
  FROM match m
  JOIN public.withdrawals w ON w.user_id = m.id
  GROUP BY m.id
)
SELECT
  m.username,
  m.display_name,
  m.country,
  m.cur                                   AS wallet_currency,
  m.wallet_balance                        AS stored_balance_local,
  ROUND(d.mwk - wd.withdrawn_mwk)        AS derived_balance_mwk,
  ROUND((d.mwk - wd.withdrawn_mwk) / public.mwk_rate(m.id)) AS derived_balance_local,
  ROUND((d.mwk - wd.withdrawn_mwk) / public.mwk_rate(m.id)) - m.wallet_balance AS discrepancy_local,
  (SELECT COUNT(*) FROM public.deposits x WHERE x.user_id = m.id)  AS ledger_rows,
  (SELECT COUNT(*) FROM public.withdrawals x WHERE x.user_id = m.id) AS withdrawal_rows
FROM match m
JOIN dep d ON d.id = m.id
JOIN wd  ON wd.id = m.id;

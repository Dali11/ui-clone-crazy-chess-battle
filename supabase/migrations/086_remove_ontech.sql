-- 086: Remove the Ontech gateway (Zambian mobile-money trial, Sept 2026).
--
-- The platform's live money rails are PawaPay only; Ontech was a trial that
-- is being fully retired. Historical rows are PRESERVED (financial integrity):
-- their provider refs are folded into the generic `reference` column, and
-- ontech_mm deposits are relabelled `mobile_money` (that is what they were —
-- AIRTEL/MTN mobile money collected via Ontech).
--
-- Note: the generic multi-currency columns from 063 (currency, amount_local,
-- fx_rate, bank_code, account_number, recipient_name) are NOT OnTech-specific
-- and stay — the PawaPay multi-corridor flow depends on them.

-- Deposits: preserve refs, relabel method, then drop the column (+ its index).
UPDATE deposits SET reference = ontech_ref
  WHERE ontech_ref IS NOT NULL AND reference IS NULL;
UPDATE deposits SET method = 'mobile_money'
  WHERE method = 'ontech_mm';
ALTER TABLE deposits DROP COLUMN IF EXISTS ontech_ref;  -- partial index drops with it

-- Withdrawals: preserve the payout ref in pawapay-style generic columns.
UPDATE withdrawals SET charge_id = ontech_ref
  WHERE ontech_ref IS NOT NULL AND charge_id IS NULL;
ALTER TABLE withdrawals DROP COLUMN IF EXISTS ontech_ref;

-- Guard: no OnTech rows should remain anywhere.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM deposits WHERE method = 'ontech_mm') THEN
    RAISE EXCEPTION 'deposits still contain ontech_mm rows';
  END IF;
END $$;

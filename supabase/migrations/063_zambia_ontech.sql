-- 063: Ontech Zambia gateway (mobile money deposits; mobile money + bank withdrawals).
-- Wallet base currency stays MWK; ZM flows convert at the prevailing rate and
-- record the local-currency amounts + rate at transaction time.

alter table deposits add column if not exists currency text;         -- local currency at pay time (ZMW)
alter table deposits add column if not exists amount_local numeric;  -- collected amount in local currency
alter table deposits add column if not exists fx_rate numeric;       -- MWK -> local rate recorded at pay time

alter table withdrawals add column if not exists currency text;
alter table withdrawals add column if not exists amount_local numeric;  -- payout amount in local currency (ZMW)
alter table withdrawals add column if not exists fx_rate numeric;
alter table withdrawals add column if not exists bank_code text;        -- AIRTEL | MTN | ZAMTEL | bank code (ZANACO…)
alter table withdrawals add column if not exists account_number text;   -- MM number or bank account no
alter table withdrawals add column if not exists recipient_name text;

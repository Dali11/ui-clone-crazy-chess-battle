-- 061: Ontech Payments (Zambia) gateway columns.
-- Ontech is a Zambian payment aggregator being trialled as a mobile-money
-- alternative to PawaPay (which requires a gambling license CCB can't
-- afford yet). Mirrors the pawapay_ref pattern already used for deposits
-- and withdrawals.

alter table deposits add column if not exists ontech_ref text;
alter table withdrawals add column if not exists ontech_ref text;

create index if not exists deposits_ontech_ref_idx on deposits (ontech_ref) where ontech_ref is not null;
create index if not exists withdrawals_ontech_ref_idx on withdrawals (ontech_ref) where ontech_ref is not null;

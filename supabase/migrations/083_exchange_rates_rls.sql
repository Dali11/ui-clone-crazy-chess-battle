-- Migration 083: Enable RLS on exchange_rates
--
-- AUDIT FIX 2026-09-16 (CRITICAL): exchange_rates had NO row-level security,
-- so anyone with the public anon key could rewrite the FX rates that drive
-- deposit conversion, membership pricing, league payouts and country-change
-- wallet re-denomination. All application reads/writes go through the
-- service-role client (which bypasses RLS) and the refresh-fx cron, so the
-- table can be fully locked: RLS enabled, zero policies.

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- Migration 080: Local-currency wallets
-- wallet_balance becomes denominated in the PLAYER'S OWN currency (derived
-- from profile.country, mirroring lib/geo/currency-map.ts). Platform prices
-- (battle stakes, tournament entry fees, prize pools, deposit MWK-equivalents,
-- admin adjustments) stay MWK and are converted at the wallet boundary by
-- credit_wallet / debit_wallet using exchange_rates.
--
-- Raw-wallet-unit functions (amounts already in the player's currency):
--   request_withdrawal  (debits the local amount the player typed)
--   refund_withdrawal   (credits back the stored local amount)
-- These are intentionally left unconverted.

-- 1. wallet_currency(user) -> ISO 4217 code of the player's wallet
CREATE OR REPLACE FUNCTION public.wallet_currency(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT m.cur FROM (VALUES
    ('MW','MWK'),
    ('US','USD'),
    ('GB','GBP'),
    ('ZA','ZAR'),
    ('KE','KES'),
    ('TZ','TZS'),
    ('ZM','ZMW'),
    ('ZW','ZWL'),
    ('MZ','MZN'),
    ('UG','UGX'),
    ('RW','RWF'),
    ('BW','BWP'),
    ('NA','NAD'),
    ('NG','NGN'),
    ('GH','GHS'),
    ('EG','EGP'),
    ('MA','MAD'),
    ('DZ','DZD'),
    ('TN','TND'),
    ('ET','ETB'),
    ('CI','XOF'),
    ('SN','XOF'),
    ('ML','XOF'),
    ('CM','XAF'),
    ('CD','CDF'),
    ('AO','AOA'),
    ('MG','MGA'),
    ('MU','MUR'),
    ('SC','SCR'),
    ('SZ','SZL'),
    ('LS','LSL'),
    ('CA','CAD'),
    ('MX','MXN'),
    ('BR','BRL'),
    ('AR','ARS'),
    ('CL','CLP'),
    ('CO','COP'),
    ('PE','PEN'),
    ('DE','EUR'),
    ('FR','EUR'),
    ('IT','EUR'),
    ('ES','EUR'),
    ('PT','EUR'),
    ('NL','EUR'),
    ('BE','EUR'),
    ('IE','EUR'),
    ('AT','EUR'),
    ('FI','EUR'),
    ('GR','EUR'),
    ('LU','EUR'),
    ('MT','EUR'),
    ('CY','EUR'),
    ('SK','EUR'),
    ('SI','EUR'),
    ('EE','EUR'),
    ('LV','EUR'),
    ('LT','EUR'),
    ('HR','EUR'),
    ('CH','CHF'),
    ('NO','NOK'),
    ('SE','SEK'),
    ('DK','DKK'),
    ('IS','ISK'),
    ('PL','PLN'),
    ('CZ','CZK'),
    ('HU','HUF'),
    ('RO','RON'),
    ('BG','BGN'),
    ('RS','RSD'),
    ('UA','UAH'),
    ('RU','RUB'),
    ('TR','TRY'),
    ('IL','ILS'),
    ('SA','SAR'),
    ('AE','AED'),
    ('QA','QAR'),
    ('KW','KWD'),
    ('BH','BHD'),
    ('OM','OMR'),
    ('JO','JOD'),
    ('LB','LBP'),
    ('IQ','IQD'),
    ('IR','IRR'),
    ('PK','PKR'),
    ('IN','INR'),
    ('BD','BDT'),
    ('LK','LKR'),
    ('NP','NPR'),
    ('CN','CNY'),
    ('HK','HKD'),
    ('TW','TWD'),
    ('JP','JPY'),
    ('KR','KRW'),
    ('SG','SGD'),
    ('MY','MYR'),
    ('TH','THB'),
    ('VN','VND'),
    ('PH','PHP'),
    ('ID','IDR'),
    ('AU','AUD'),
    ('NZ','NZD'),
    ('FJ','FJD')
    ) AS m(cc, cur) WHERE m.cc = upper(p.country)),
    'MWK')
  FROM public.profiles p
  WHERE p.id = p_user_id
$$;

-- 2. mwk_rate(user) -> how many local units 1 MWK is worth; -1 = no rate
CREATE OR REPLACE FUNCTION public.mwk_rate(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(public.wallet_currency(p_user_id), 'MWK') = 'MWK' THEN 1
    ELSE COALESCE(
      (SELECT rate FROM public.exchange_rates
        WHERE base_currency = 'MWK'
          AND target_currency = public.wallet_currency(p_user_id)
        ORDER BY fetched_at DESC LIMIT 1),
      -1)
  END
$$;

-- 3. credit_wallet: takes a MWK amount, credits the player's wallet in their
--    own currency (rounded). MWK wallets skip conversion entirely.
CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
  v_local integer;
BEGIN
  v_rate := public.mwk_rate(p_user_id);
  IF v_rate < 0 THEN
    RAISE EXCEPTION 'FX rate unavailable for this wallet currency';
  END IF;
  v_local := round(p_amount * v_rate)::integer;
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_local,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- 4. debit_wallet: takes a MWK amount, debits the player's wallet in their
--    own currency. Symmetric with credit_wallet (same rate, same rounding),
--    so refunds return exactly what was charged.
CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
  v_local integer;
BEGIN
  v_rate := public.mwk_rate(p_user_id);
  IF v_rate < 0 THEN
    RAISE EXCEPTION 'FX rate unavailable for this wallet currency';
  END IF;
  v_local := round(p_amount * v_rate)::integer;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND wallet_balance >= v_local) THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  UPDATE public.profiles
  SET wallet_balance = wallet_balance - v_local,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- 5. Affiliate commissions: route through credit_wallet so the referrer's
--    wallet stays in their own currency too.
CREATE OR REPLACE FUNCTION public.process_affiliate_commission(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral RECORD;
  v_commission INT;
BEGIN
  SELECT * INTO v_referral FROM public.referrals WHERE referred_id = p_user_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_commission := FLOOR(p_amount * 0.25);
  IF v_commission <= 0 THEN RETURN 0; END IF;
  PERFORM public.credit_wallet(v_referral.referrer_id, v_commission);
  INSERT INTO public.deposits (user_id, amount, method, status, reference)
  VALUES (v_referral.referrer_id, v_commission, 'affiliate_commission', 'success', 'affiliate:' || p_user_id::text || ':membership:mk' || p_amount);
  IF v_referral.status NOT IN ('rewarded', 'activated') THEN
    UPDATE public.referrals SET status = 'rewarded', activated_at = now(), completed_at = now(), activation_condition = 'membership_purchase', berries_awarded = 0, commission_amount = v_commission, commission_paid = true WHERE id = v_referral.id;
    PERFORM public.grant_referral_xp_boost(v_referral.referrer_id);
  ELSE
    UPDATE public.referrals SET commission_amount = commission_amount + v_commission, commission_paid = true WHERE id = v_referral.id;
  END IF;
  RETURN v_commission;
END;
$$;

-- Migration 081: Lock country at account creation, allow ONE change
--
-- Country is set at signup (geo-detected on the client, passed in auth
-- metadata) and locked thereafter. A player may change it exactly ONCE in
-- profile settings; after that only support (service role) can change it.
--
-- Changing country re-denominates the wallet balance at the current FX
-- rate (local_old -> MWK -> local_new) so value is preserved — without
-- this a 1000 MWK balance would silently read as 1000 ZMW (~90x).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_change_used BOOLEAN NOT NULL DEFAULT FALSE;

-- Currency for a country code — the shared map, refactored out of
-- wallet_currency so triggers can use it directly.
CREATE OR REPLACE FUNCTION public.country_currency(p_country text)
RETURNS text
LANGUAGE sql
STABLE
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
    ) AS m(cc, cur) WHERE m.cc = upper(coalesce(p_country, ''))),
    'MWK')
$$;

-- wallet_currency now delegates to country_currency
CREATE OR REPLACE FUNCTION public.wallet_currency(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.country_currency((SELECT country FROM public.profiles WHERE id = p_user_id))
$$;

-- Enforce the one-change rule + wallet re-denomination on every update.
CREATE OR REPLACE FUNCTION public.enforce_country_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old_cur text;
  v_new_cur text;
  v_rate_old numeric;
  v_rate_new numeric;
BEGIN
  -- Never allow clearing the country
  IF NEW.country IS DISTINCT FROM OLD.country AND NEW.country IS NULL THEN
    NEW.country := OLD.country;
    RETURN NEW;
  END IF;

  IF NEW.country IS DISTINCT FROM OLD.country THEN
    -- A pending/approved withdrawal stores a raw local-currency amount that
    -- would be refunded in the NEW currency — block until it completes.
    IF EXISTS (
      SELECT 1 FROM public.withdrawals
      WHERE user_id = OLD.id AND status IN ('pending', 'approved')
    ) THEN
      RAISE EXCEPTION 'COUNTRY_CHANGE_BLOCKED: you have a withdrawal being processed — wait for it to complete before changing country';
    END IF;

    -- Service role (support/admin panel) can always override and does not
    -- consume the player's one free change.
    -- COALESCE: auth.role() is NULL outside a JWT session (e.g. direct SQL);
    -- NULL <> 'service_role' would evaluate to NULL and silently skip this.
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
      IF OLD.country_change_used THEN
        RAISE EXCEPTION 'COUNTRY_CHANGE_USED: country can only be changed once. Contact support if you need to change it again.';
      END IF;
      NEW.country_change_used := TRUE;
    END IF;

    -- Re-denominate the wallet: local_old -> MWK -> local_new
    v_old_cur := public.country_currency(OLD.country);
    v_new_cur := public.country_currency(NEW.country);
    IF v_old_cur <> v_new_cur AND COALESCE(NEW.wallet_balance, 0) <> 0 THEN
      SELECT rate INTO v_rate_old FROM public.exchange_rates
        WHERE base_currency = 'MWK' AND target_currency = v_old_cur
        ORDER BY fetched_at DESC LIMIT 1;
      SELECT rate INTO v_rate_new FROM public.exchange_rates
        WHERE base_currency = 'MWK' AND target_currency = v_new_cur
        ORDER BY fetched_at DESC LIMIT 1;
      IF v_old_cur = 'MWK' THEN v_rate_old := 1; END IF;
      IF v_new_cur = 'MWK' THEN v_rate_new := 1; END IF;
      IF v_rate_old IS NULL OR v_rate_new IS NULL OR v_rate_old <= 0 OR v_rate_new <= 0 THEN
        RAISE EXCEPTION 'COUNTRY_CHANGE_FX: currency conversion is temporarily unavailable — please try again shortly';
      END IF;
      NEW.wallet_balance := ROUND(NEW.wallet_balance / v_rate_old * v_rate_new)::integer;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS profiles_country_lock ON public.profiles;
CREATE TRIGGER profiles_country_lock
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_country_change();

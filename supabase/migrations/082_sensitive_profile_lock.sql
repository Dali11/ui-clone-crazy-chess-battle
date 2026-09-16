-- Migration 082: Lock sensitive profile columns from direct client edits
--
-- AUDIT FIX 2026-09-16 (CRITICAL): the profiles RLS policy
-- "Users can update own profile" allows any authenticated player to update
-- their own row — and RLS is row-level only, it cannot restrict columns.
-- Nothing prevented a player from running, from their browser:
--   supabase.from('profiles').update({ wallet_balance: 99999999, is_admin: true })
-- bypassing every atomic wallet function. This trigger blocks changes to
-- money / admin / verification / stats columns unless the caller is the
-- service_role (server-side code), mirroring the pattern already used by
-- the country-lock and deposit-phone-lock triggers.
--
-- Columns players may still edit (settings page): display_name, bio, phone,
-- country (via country-lock rules), gender, avatar_url, deposit_phone_numbers
-- (own trigger), username, full_name, chess_level.

CREATE OR REPLACE FUNCTION public.enforce_sensitive_profile_lock()
RETURNS TRIGGER AS $$
BEGIN
  -- Server-side code (service_role) may change anything.
  -- COALESCE: auth.role() is NULL outside a JWT session (direct SQL).
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
    RAISE EXCEPTION 'PROFILE_LOCK: wallet_balance is managed by the platform';
  END IF;
  IF NEW.berry_balance IS DISTINCT FROM OLD.berry_balance THEN
    RAISE EXCEPTION 'PROFILE_LOCK: berry_balance is managed by the platform';
  END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'PROFILE_LOCK: is_admin is managed by the platform';
  END IF;
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'PROFILE_LOCK: is_banned is managed by the platform';
  END IF;
  IF NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.rating_deviation IS DISTINCT FROM OLD.rating_deviation
     OR NEW.rating_volatility IS DISTINCT FROM OLD.rating_volatility THEN
    RAISE EXCEPTION 'PROFILE_LOCK: rating fields are managed by the platform';
  END IF;
  IF NEW.draughts_rating IS DISTINCT FROM OLD.draughts_rating
     OR NEW.draughts_games_played IS DISTINCT FROM OLD.draughts_games_played
     OR NEW.draughts_wins IS DISTINCT FROM OLD.draughts_wins
     OR NEW.draughts_losses IS DISTINCT FROM OLD.draughts_losses
     OR NEW.draughts_draws IS DISTINCT FROM OLD.draughts_draws THEN
    RAISE EXCEPTION 'PROFILE_LOCK: draughts stats are managed by the platform';
  END IF;
  IF NEW.games_played IS DISTINCT FROM OLD.games_played
     OR NEW.wins IS DISTINCT FROM OLD.wins
     OR NEW.losses IS DISTINCT FROM OLD.losses
     OR NEW.draws IS DISTINCT FROM OLD.draws
     OR NEW.tournaments_played IS DISTINCT FROM OLD.tournaments_played
     OR NEW.tournaments_won IS DISTINCT FROM OLD.tournaments_won THEN
    RAISE EXCEPTION 'PROFILE_LOCK: game stats are managed by the platform';
  END IF;
  IF NEW.membership_until IS DISTINCT FROM OLD.membership_until THEN
    RAISE EXCEPTION 'PROFILE_LOCK: membership is managed by the platform';
  END IF;
  IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
     OR NEW.phone_number IS DISTINCT FROM OLD.phone_number
     OR NEW.identity_verified IS DISTINCT FROM OLD.identity_verified
     OR NEW.identity_verification_method IS DISTINCT FROM OLD.identity_verification_method
     OR NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at
     OR NEW.chesscom_verified IS DISTINCT FROM OLD.chesscom_verified
     OR NEW.chesscom_username IS DISTINCT FROM OLD.chesscom_username THEN
    RAISE EXCEPTION 'PROFILE_LOCK: verification fields are managed by the platform';
  END IF;
  IF NEW.country_change_used IS DISTINCT FROM OLD.country_change_used THEN
    RAISE EXCEPTION 'PROFILE_LOCK: country_change_used is managed by the platform';
  END IF;
  IF NEW.account_created_at IS DISTINCT FROM OLD.account_created_at THEN
    RAISE EXCEPTION 'PROFILE_LOCK: account_created_at is managed by the platform';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'PROFILE_LOCK: email is managed by account settings';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profiles_sensitive_lock ON public.profiles;
CREATE TRIGGER profiles_sensitive_lock
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sensitive_profile_lock();

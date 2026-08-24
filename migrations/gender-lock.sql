-- ============================================================
-- Gender Lock & Identity Verification Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add gender_verified_at column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender_verified_at TIMESTAMPTZ;

-- 2. Trigger: reset identity_verified when gender changes
CREATE OR REPLACE FUNCTION reset_identity_on_gender_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.gender IS DISTINCT FROM OLD.gender THEN
    NEW.identity_verified := FALSE;
    NEW.identity_verified_at := NULL;
    NEW.gender_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reset_identity_on_gender_change ON profiles;
CREATE TRIGGER trigger_reset_identity_on_gender_change
  BEFORE UPDATE OF gender ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION reset_identity_on_gender_change();

-- 3. Trigger: lock gender once set (block regular users, allow admin/service_role)
CREATE OR REPLACE FUNCTION lock_gender_once_set()
RETURNS TRIGGER AS $$
BEGIN
  -- Only block if a regular user is trying to change an already-set gender
  -- auth.uid() returns NULL when using service_role key (admin updates)
  IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Gender is locked once set. Contact an admin to change it.'
        USING HINT = 'GENDER_LOCKED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_lock_gender ON profiles;
CREATE TRIGGER trigger_lock_gender
  BEFORE UPDATE OF gender ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION lock_gender_once_set();

-- 4. Backfill: set gender_verified_at for already identity_verified profiles
UPDATE profiles
SET gender_verified_at = COALESCE(identity_verified_at, updated_at, NOW())
WHERE identity_verified = true AND gender IS NOT NULL AND gender_verified_at IS NULL;

-- ============================================================
-- Verification: check that triggers are created
-- ============================================================
SELECT tgname, tgrelid::regclass, tgenabled 
FROM pg_trigger 
WHERE tgrelid = 'profiles'::regclass AND NOT tgisinternal;

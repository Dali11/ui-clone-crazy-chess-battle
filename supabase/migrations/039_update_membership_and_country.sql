-- ============================================================
-- Update membership price to MK10,000 and add country to profiles
-- ============================================================

-- 1. Update Malawi membership price from MK5,000 to MK10,000
UPDATE public.market_config
SET membership_price_cents = 1000000,
    updated_at = now()
WHERE country_code = 'MW';

-- 2. Add country column to profiles if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT;

-- 3. Set all existing players to Malawi
UPDATE public.profiles SET country = 'MW' WHERE country IS NULL;

-- 4. Update the handle_new_user trigger to include country
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_chess_level TEXT;
  v_rating INT;
  v_country TEXT;
BEGIN
  v_chess_level := COALESCE(NEW.raw_user_meta_data->>'chess_level', 'beginner');
  v_country := COALESCE(NEW.raw_user_meta_data->>'country', 'MW');
  
  v_rating := CASE 
    WHEN v_chess_level = 'expert' THEN 2500
    WHEN v_chess_level = 'intermediate' THEN 1500
    ELSE 400
  END;
  
  INSERT INTO public.profiles (id, username, display_name, chess_level, rating, country)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_chess_level,
    v_rating,
    v_country
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

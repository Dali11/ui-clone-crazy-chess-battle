-- Migration 023: Add bot win berry config and update default live win to 20
-- Adds berry_bot_win column for bot game berry rewards
-- Updates berries_per_win default to 20 (was 10)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'berry_config' AND column_name = 'berry_bot_win'
  ) THEN
    ALTER TABLE berry_config ADD COLUMN berry_bot_win INT NOT NULL DEFAULT 10;
  END IF;
END $$;

-- Update existing config row to set live win to 20 if it's still the old default of 10
UPDATE berry_config SET berries_per_win = 20 WHERE berries_per_win = 10;

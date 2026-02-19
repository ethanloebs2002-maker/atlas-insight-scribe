
-- Drop partial unique index (not usable for ON CONFLICT)
DROP INDEX IF EXISTS whale_signals_v2_dedupe_key_uniq;

-- Create a proper unique constraint on dedupe_key (nulls are always unique in PG, so this is safe)
ALTER TABLE whale_signals_v2 ADD CONSTRAINT whale_signals_v2_dedupe_key_unique UNIQUE (dedupe_key);

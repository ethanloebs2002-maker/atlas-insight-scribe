
-- Add required_at_phases to atlas_memory_sources
ALTER TABLE public.atlas_memory_sources
ADD COLUMN IF NOT EXISTS required_at_phases text[] NOT NULL DEFAULT ARRAY['DECISION_EMIT','ENTRY_FILLED','EXIT_CLOSED'];


-- Add probability diagnostic columns to paper_decisions
ALTER TABLE public.paper_decisions
  ADD COLUMN IF NOT EXISTS probability_raw double precision,
  ADD COLUMN IF NOT EXISTS probability_source text;

ALTER TABLE public.paper_decisions
  ADD COLUMN IF NOT EXISTS probability_components jsonb;
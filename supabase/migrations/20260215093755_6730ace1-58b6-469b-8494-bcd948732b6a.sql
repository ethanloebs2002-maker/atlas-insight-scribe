
-- Add initial probability columns to paper_trades
ALTER TABLE public.paper_trades
  ADD COLUMN IF NOT EXISTS initial_probability_pred double precision,
  ADD COLUMN IF NOT EXISTS initial_probability_source text;

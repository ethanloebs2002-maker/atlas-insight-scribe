
-- Add duplicate_key and close_reason columns to paper_trades
ALTER TABLE public.paper_trades
  ADD COLUMN IF NOT EXISTS duplicate_key text,
  ADD COLUMN IF NOT EXISTS close_reason text;

-- Index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_paper_trades_dedupe
  ON public.paper_trades (duplicate_key, status)
  WHERE status IN ('OPEN', 'PENDING');

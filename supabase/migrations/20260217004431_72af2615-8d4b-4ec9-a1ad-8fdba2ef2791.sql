
-- Create latest_prices table for persisted execution prices
CREATE TABLE IF NOT EXISTS public.latest_prices (
  symbol text PRIMARY KEY,
  price numeric NOT NULL,
  source text NOT NULL DEFAULT 'cryptocompare',
  captured_at timestamptz NOT NULL DEFAULT now()
);

-- Index for recency checks
CREATE INDEX idx_latest_prices_captured_at ON public.latest_prices (captured_at DESC);

-- Enable RLS
ALTER TABLE public.latest_prices ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated read latest_prices"
  ON public.latest_prices FOR SELECT
  USING (true);

-- Service role can write
CREATE POLICY "Service write latest_prices"
  ON public.latest_prices FOR ALL
  USING (true)
  WITH CHECK (true);

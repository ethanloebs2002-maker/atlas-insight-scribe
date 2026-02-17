
-- ═══════════════════════════════════════════════════════════════════
-- ATLAS Canonical Market Data Backbone — Tables
-- ═══════════════════════════════════════════════════════════════════

-- 1A) latest_prices already exists (from prior migration). Ensure index + policies.
CREATE INDEX IF NOT EXISTS latest_prices_time_idx ON public.latest_prices(captured_at DESC);

-- 1B) latest_orderbook — one row per symbol, execution-grade order book summary
CREATE TABLE IF NOT EXISTS public.latest_orderbook (
  symbol text PRIMARY KEY,
  bid_price numeric NOT NULL,
  ask_price numeric NOT NULL,
  bid_size numeric NULL,
  ask_size numeric NULL,
  spread_bps numeric NOT NULL,
  imbalance numeric NULL,
  source text NOT NULL DEFAULT 'runtime',
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS latest_orderbook_time_idx ON public.latest_orderbook(captured_at DESC);

ALTER TABLE public.latest_orderbook ENABLE ROW LEVEL SECURITY;

CREATE POLICY "latest_orderbook_read"
  ON public.latest_orderbook
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "latest_orderbook_service_all"
  ON public.latest_orderbook
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 1C) market_data_config — tunable cadence + staleness thresholds
CREATE TABLE IF NOT EXISTS public.market_data_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbols text[] NOT NULL DEFAULT ARRAY['BTC','ETH','SOL','DOGE','AVAX','LINK'],
  price_source text NOT NULL DEFAULT 'binance_spot',
  orderbook_source text NOT NULL DEFAULT 'binance_spot',
  stale_ms_exec int NOT NULL DEFAULT 1500,
  stale_ms_ui int NOT NULL DEFAULT 5000,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed a single default config row
INSERT INTO public.market_data_config (symbols, price_source, orderbook_source, stale_ms_exec, stale_ms_ui)
SELECT ARRAY['BTC','ETH','SOL','DOGE','AVAX','LINK'], 'binance_spot', 'binance_spot', 1500, 5000
WHERE NOT EXISTS (SELECT 1 FROM public.market_data_config);

ALTER TABLE public.market_data_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_data_config_read"
  ON public.market_data_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "market_data_config_service_all"
  ON public.market_data_config
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

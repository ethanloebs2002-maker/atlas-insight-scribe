
-- ═══════════════════════════════════════════════════════════════
-- ATLAS v1.8.5 — Incorporated Assets, Timeframe Stats, Eval Mode
-- ═══════════════════════════════════════════════════════════════

-- 1) Incorporated assets table — source of truth for auto-eval universe
CREATE TABLE public.incorporated_assets (
  asset_id TEXT NOT NULL PRIMARY KEY,
  symbol TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  default_timeframe TEXT NOT NULL DEFAULT '4h',
  liquidity_tier TEXT NOT NULL DEFAULT 'mid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.incorporated_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read incorporated_assets"
  ON public.incorporated_assets FOR SELECT
  USING (true);

CREATE POLICY "Service write incorporated_assets"
  ON public.incorporated_assets FOR ALL
  USING (true) WITH CHECK (true);

-- Seed initial assets
INSERT INTO public.incorporated_assets (asset_id, symbol, default_timeframe, liquidity_tier) VALUES
  ('BTC', 'BTC', '4h', 'high'),
  ('ETH', 'ETH', '4h', 'high'),
  ('SOL', 'SOL', '4h', 'mid'),
  ('DOGE', 'DOGE', '4h', 'mid'),
  ('AVAX', 'AVAX', '4h', 'mid'),
  ('LINK', 'LINK', '4h', 'mid');

-- 2) Timeframe stats table — per-asset per-TF performance tracking
CREATE TABLE public.timeframe_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '4h',
  trades_n INTEGER NOT NULL DEFAULT 0,
  wins_n INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC NOT NULL DEFAULT 0,
  win_rate_recent NUMERIC NOT NULL DEFAULT 0,
  ev_mean NUMERIC NOT NULL DEFAULT 0,
  calibration_error NUMERIC NOT NULL DEFAULT 0,
  drift_flag BOOLEAN NOT NULL DEFAULT false,
  success_likelihood_score NUMERIC NOT NULL DEFAULT 0,
  last_updated_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, timeframe)
);

ALTER TABLE public.timeframe_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read timeframe_stats"
  ON public.timeframe_stats FOR SELECT
  USING (true);

CREATE POLICY "Service write timeframe_stats"
  ON public.timeframe_stats FOR ALL
  USING (true) WITH CHECK (true);

-- 3) Add evaluation_mode column to evaluation_runs
ALTER TABLE public.evaluation_runs
  ADD COLUMN IF NOT EXISTS evaluation_mode TEXT NOT NULL DEFAULT 'EXPLOIT',
  ADD COLUMN IF NOT EXISTS chosen_timeframe TEXT,
  ADD COLUMN IF NOT EXISTS best_tf_score NUMERIC;

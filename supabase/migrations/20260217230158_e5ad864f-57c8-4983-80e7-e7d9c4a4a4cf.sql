
-- ═══ RISK LAB v1 Migration ═══

-- A1) Add risk profile metadata columns to paper_positions
ALTER TABLE public.paper_positions
  ADD COLUMN IF NOT EXISTS risk_profile_key text,
  ADD COLUMN IF NOT EXISTS risk_profile jsonb,
  ADD COLUMN IF NOT EXISTS vol_regime_at_entry text,
  ADD COLUMN IF NOT EXISTS spread_bps_at_entry numeric,
  ADD COLUMN IF NOT EXISTS imbalance_at_entry numeric,
  ADD COLUMN IF NOT EXISTS entry_mid_price numeric,
  ADD COLUMN IF NOT EXISTS entry_bid numeric,
  ADD COLUMN IF NOT EXISTS entry_ask numeric;

CREATE INDEX IF NOT EXISTS idx_positions_risk_profile
  ON public.paper_positions (symbol, timeframe, risk_profile_key);
CREATE INDEX IF NOT EXISTS idx_positions_status_filled
  ON public.paper_positions (status, filled_at);

-- A2) Risk profile performance table
CREATE TABLE IF NOT EXISTS public.risk_profile_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  timeframe text NOT NULL,
  regime text NOT NULL,
  spread_bucket text NOT NULL,
  risk_profile_key text NOT NULL,
  trades int NOT NULL DEFAULT 0,
  wins int NOT NULL DEFAULT 0,
  losses int NOT NULL DEFAULT 0,
  sum_r numeric NOT NULL DEFAULT 0,
  sum_pnl numeric NOT NULL DEFAULT 0,
  avg_r numeric NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol, timeframe, regime, spread_bucket, risk_profile_key)
);

CREATE INDEX IF NOT EXISTS idx_risk_perf_champion
  ON public.risk_profile_performance (symbol, timeframe, regime, spread_bucket, win_rate DESC);

ALTER TABLE public.risk_profile_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read risk performance"
  ON public.risk_profile_performance FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage risk performance"
  ON public.risk_profile_performance FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- A3) Add risk lab config to paper_policy
ALTER TABLE public.paper_policy
  ADD COLUMN IF NOT EXISTS risk_lab_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS risk_lab_variants int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS risk_lab_atr_mults numeric[] NOT NULL DEFAULT '{1.2,1.6,2.0}',
  ADD COLUMN IF NOT EXISTS risk_lab_mode text NOT NULL DEFAULT 'siblings',
  ADD COLUMN IF NOT EXISTS risk_lab_min_trades int NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS risk_lab_decay numeric NOT NULL DEFAULT 0.97,
  ADD COLUMN IF NOT EXISTS risk_lab_champion_bias numeric NOT NULL DEFAULT 0.65,
  ADD COLUMN IF NOT EXISTS risk_lab_explore_bias numeric NOT NULL DEFAULT 0.35;


-- =====================================================
-- STRATEGY GENOME: Tables, Indexes, RLS, Seed Data
-- =====================================================

-- A1) strategy_primitives
CREATE TABLE IF NOT EXISTS public.strategy_primitives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  category text NOT NULL CHECK (category IN ('signal','gate','risk','exit','sizing')),
  description text NOT NULL,
  param_schema jsonb NOT NULL DEFAULT '{}',
  default_params jsonb NOT NULL DEFAULT '{}',
  requires_features text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.strategy_primitives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read primitives" ON public.strategy_primitives FOR SELECT USING (auth.role() = 'authenticated');

-- A2) strategy_blueprints
CREATE TABLE IF NOT EXISTS public.strategy_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  genome jsonb NOT NULL DEFAULT '{}',
  tags text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_by text DEFAULT 'atlas',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.strategy_blueprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read blueprints" ON public.strategy_blueprints FOR SELECT USING (auth.role() = 'authenticated');

-- A3) strategy_runs
CREATE TABLE IF NOT EXISTS public.strategy_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.strategy_blueprints(id) ON DELETE CASCADE,
  symbols text[] NOT NULL,
  timeframe text NOT NULL,
  start_ts timestamptz NOT NULL,
  end_ts timestamptz NOT NULL,
  mode text NOT NULL DEFAULT 'paper_live' CHECK (mode IN ('paper_live','replay','micro_sim')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','DONE','FAILED')),
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.strategy_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read runs" ON public.strategy_runs FOR SELECT USING (auth.role() = 'authenticated');

-- A4) strategy_scores
CREATE TABLE IF NOT EXISTS public.strategy_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.strategy_runs(id) ON DELETE CASCADE,
  blueprint_id uuid NOT NULL REFERENCES public.strategy_blueprints(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  sample_trades int NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  expectancy_r numeric NOT NULL DEFAULT 0,
  profit_factor numeric NOT NULL DEFAULT 0,
  max_drawdown_r numeric NOT NULL DEFAULT 0,
  sharpe_proxy numeric NOT NULL DEFAULT 0,
  stability numeric NOT NULL DEFAULT 0,
  regime_breakdown jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz DEFAULT now()
);
CREATE INDEX idx_strategy_scores_lookup ON public.strategy_scores (blueprint_id, symbol, timeframe, computed_at DESC);
ALTER TABLE public.strategy_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read scores" ON public.strategy_scores FOR SELECT USING (auth.role() = 'authenticated');

-- A5) strategy_reputation
CREATE TABLE IF NOT EXISTS public.strategy_reputation (
  blueprint_id uuid PRIMARY KEY REFERENCES public.strategy_blueprints(id) ON DELETE CASCADE,
  reputation numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0.2,
  last_updated timestamptz DEFAULT now(),
  notes text
);
ALTER TABLE public.strategy_reputation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read reputation" ON public.strategy_reputation FOR SELECT USING (auth.role() = 'authenticated');

-- Shadow signals table for tournament
CREATE TABLE IF NOT EXISTS public.strategy_shadow_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.strategy_blueprints(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  direction text NOT NULL,
  entry_price numeric,
  stop_price numeric,
  tp_price numeric,
  risk_pct numeric,
  gate_results jsonb DEFAULT '{}',
  vetoed boolean DEFAULT false,
  veto_reason text,
  feature_snapshot jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shadow_signals_bp ON public.strategy_shadow_signals (blueprint_id, created_at DESC);
ALTER TABLE public.strategy_shadow_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read shadow signals" ON public.strategy_shadow_signals FOR SELECT USING (auth.role() = 'authenticated');

-- Link blueprints to positions/decisions
ALTER TABLE public.paper_positions ADD COLUMN IF NOT EXISTS strategy_blueprint_id uuid REFERENCES public.strategy_blueprints(id);
ALTER TABLE public.paper_decisions ADD COLUMN IF NOT EXISTS strategy_blueprint_id uuid REFERENCES public.strategy_blueprints(id);

-- Policy columns for tournament control
ALTER TABLE public.paper_policy ADD COLUMN IF NOT EXISTS strategy_shadow_only boolean DEFAULT true;
ALTER TABLE public.paper_policy ADD COLUMN IF NOT EXISTS strategy_live_fraction numeric DEFAULT 0.2;
ALTER TABLE public.paper_policy ADD COLUMN IF NOT EXISTS tournament_top_k int DEFAULT 8;
ALTER TABLE public.paper_policy ADD COLUMN IF NOT EXISTS tournament_explore_k int DEFAULT 3;

-- =====================================================
-- SEED: 20+ primitives
-- =====================================================
INSERT INTO public.strategy_primitives (key, category, description, param_schema, default_params, requires_features) VALUES
  ('ema_cross', 'signal', 'EMA fast/slow crossover signal', '{"fast_period":"int","slow_period":"int"}', '{"fast_period":9,"slow_period":21}', '{"ema"}'),
  ('ema_trend_filter', 'gate', 'Allow trades only in EMA trend direction', '{"period":"int"}', '{"period":50}', '{"ema"}'),
  ('rsi_fade', 'signal', 'Fade RSI extremes (oversold buy, overbought sell)', '{"period":"int","ob_level":"int","os_level":"int"}', '{"period":14,"ob_level":70,"os_level":30}', '{"rsi"}'),
  ('bollinger_fade', 'signal', 'Mean reversion from Bollinger Band touches', '{"period":"int","std_dev":"float"}', '{"period":20,"std_dev":2.0}', '{"bollinger"}'),
  ('donchian_breakout', 'signal', 'Breakout above/below Donchian channel', '{"period":"int"}', '{"period":20}', '{"donchian"}'),
  ('atr_breakout', 'signal', 'Price exceeds N*ATR from recent close', '{"period":"int","multiplier":"float"}', '{"period":14,"multiplier":1.5}', '{"atr"}'),
  ('squeeze_release', 'signal', 'Bollinger inside Keltner squeeze then expansion', '{"bb_period":"int","kc_period":"int","kc_mult":"float"}', '{"bb_period":20,"kc_period":20,"kc_mult":1.5}', '{"bollinger","atr"}'),
  ('momentum_nbar', 'signal', 'N-bar rate of change momentum', '{"lookback":"int","threshold":"float"}', '{"lookback":10,"threshold":0.5}', '{"close"}'),
  ('macd_cross', 'signal', 'MACD line crosses signal line', '{"fast":"int","slow":"int","signal":"int"}', '{"fast":12,"slow":26,"signal":9}', '{"ema"}'),
  ('mean_reversion_zscore', 'signal', 'Z-score of price vs rolling mean', '{"period":"int","z_threshold":"float"}', '{"period":50,"z_threshold":2.0}', '{"close"}'),
  ('vol_regime_gate', 'gate', 'Only trade in specified volatility regime', '{"allowed_regimes":"string[]"}', '{"allowed_regimes":["normal","compression"]}', '{"atr","session"}'),
  ('spread_gate', 'gate', 'Block if spread exceeds threshold', '{"max_spread_bps":"float"}', '{"max_spread_bps":15}', '{"orderbook"}'),
  ('imbalance_gate', 'gate', 'Block if orderbook imbalance too extreme', '{"max_abs_imbalance":"float"}', '{"max_abs_imbalance":0.7}', '{"orderbook"}'),
  ('session_gate', 'gate', 'Only trade during specified session buckets', '{"allowed_sessions":"string[]"}', '{"allowed_sessions":["europe","us","overlap"]}', '{"session"}'),
  ('freshness_gate', 'gate', 'Block if market data age exceeds threshold', '{"max_age_ms":"int"}', '{"max_age_ms":5000}', '{"orderbook"}'),
  ('fixed_bracket', 'risk', 'Fixed SL/TP in percentage terms', '{"sl_pct":"float","tp_pct":"float"}', '{"sl_pct":1.5,"tp_pct":3.0}', '{"close"}'),
  ('atr_bracket', 'risk', 'ATR-based SL/TP bracket', '{"atr_period":"int","sl_mult":"float","tp_mult":"float"}', '{"atr_period":14,"sl_mult":1.5,"tp_mult":3.0}', '{"atr"}'),
  ('trailing_stop', 'exit', 'Trailing stop that follows price', '{"trail_pct":"float"}', '{"trail_pct":1.0}', '{"close"}'),
  ('time_stop', 'exit', 'Close after N minutes if not hit', '{"max_minutes":"int"}', '{"max_minutes":1440}', '{"close"}'),
  ('fixed_risk_pct', 'sizing', 'Risk fixed % of equity per trade', '{"risk_pct":"float"}', '{"risk_pct":1.0}', '{}'),
  ('capped_notional', 'sizing', 'Cap position notional in USD', '{"max_usd":"float"}', '{"max_usd":1000}', '{}'),
  ('confidence_scaled', 'sizing', 'Scale size by signal confidence', '{"base_pct":"float","scale_factor":"float"}', '{"base_pct":0.5,"scale_factor":2.0}', '{}')
ON CONFLICT (key) DO NOTHING;

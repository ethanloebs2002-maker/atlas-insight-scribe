
-- Paper Decisions: every increment, even if no trade triggers
CREATE TABLE public.paper_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  asset_id TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '4h',
  horizon TEXT NOT NULL DEFAULT '24h',
  ref_price NUMERIC NOT NULL,
  direction_pred TEXT NOT NULL CHECK (direction_pred IN ('UP', 'DOWN', 'NEUTRAL')),
  probability_pred NUMERIC NOT NULL,
  agreement_score NUMERIC NOT NULL DEFAULT 0,
  consensus_score NUMERIC NOT NULL DEFAULT 0,
  completeness_score NUMERIC NOT NULL DEFAULT 0,
  evidence_snapshot_json JSONB,
  realized_dir TEXT CHECK (realized_dir IN ('UP', 'DOWN', 'NEUTRAL')),
  realized_move_pct NUMERIC,
  evaluated_at TIMESTAMP WITH TIME ZONE,
  correct BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Paper Trades: only when triggers occur
CREATE TABLE public.paper_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id UUID REFERENCES public.paper_decisions(id),
  ts_created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ts_opened TIMESTAMP WITH TIME ZONE,
  ts_closed TIMESTAMP WITH TIME ZONE,
  asset_id TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '4h',
  regime_label TEXT,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('bullish', 'bearish', 'neutral')),
  entry_zone_low NUMERIC NOT NULL,
  entry_zone_high NUMERIC NOT NULL,
  trigger_rule TEXT,
  fill_price NUMERIC,
  stop_level NUMERIC,
  stop_rule TEXT,
  targets_json JSONB,
  time_window_end TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'OPEN', 'CLOSED')),
  exit_price NUMERIC,
  outcome_label TEXT CHECK (outcome_label IN ('WIN', 'LOSS', 'BREAKEVEN', 'EXPIRED')),
  return_pct NUMERIC,
  return_r NUMERIC,
  mae_r NUMERIC,
  mfe_r NUMERIC,
  evidence_snapshot_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Graduation tracking per asset/timeframe/horizon
CREATE TABLE public.graduation_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '4h',
  horizon TEXT NOT NULL DEFAULT '24h',
  n_decisions INTEGER NOT NULL DEFAULT 0,
  n_opened_trades INTEGER NOT NULL DEFAULT 0,
  dir_acc NUMERIC DEFAULT 0,
  avg_return_r NUMERIC DEFAULT 0,
  median_r NUMERIC DEFAULT 0,
  graduation_level INTEGER NOT NULL DEFAULT 0 CHECK (graduation_level BETWEEN 0 AND 3),
  influence_mode TEXT NOT NULL DEFAULT 'OFF' CHECK (influence_mode IN ('OFF', 'Calibration', 'Weights', 'Sizing')),
  last_drift_check TIMESTAMP WITH TIME ZONE,
  integrity_gating_pass BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(asset_id, timeframe, horizon)
);

-- Indexes for performance
CREATE INDEX idx_paper_decisions_asset_ts ON public.paper_decisions(asset_id, ts DESC);
CREATE INDEX idx_paper_decisions_evaluated ON public.paper_decisions(asset_id, evaluated_at) WHERE evaluated_at IS NULL;
CREATE INDEX idx_paper_trades_asset_status ON public.paper_trades(asset_id, status);
CREATE INDEX idx_paper_trades_decision ON public.paper_trades(decision_id);

-- No RLS needed - this is a system-level paper trading engine, not user-specific data
-- All data is public/shared analysis
ALTER TABLE public.paper_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduation_status ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (no auth required for paper trading engine)
CREATE POLICY "Public access paper_decisions" ON public.paper_decisions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access paper_trades" ON public.paper_trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access graduation_status" ON public.graduation_status FOR ALL USING (true) WITH CHECK (true);

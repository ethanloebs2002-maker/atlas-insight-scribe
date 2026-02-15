
-- ═══════════════════════════════════════════════════════════════
-- ATLAS v1.5: Per-Indicator Attribution + Pattern Discovery
-- ═══════════════════════════════════════════════════════════════

-- 1) INDICATOR SNAPSHOTS — full indicator state at decision time
CREATE TABLE public.indicator_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.paper_decisions(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  timeframe_primary TEXT NOT NULL DEFAULT '4h',
  timeframe_confirm TEXT,
  regime_label TEXT NOT NULL DEFAULT 'Unknown',
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  indicators_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  role_scores_json JSONB DEFAULT '{}'::jsonb,
  integrity_json JSONB DEFAULT '{}'::jsonb,
  engine_outputs_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_indicator_snapshots_decision ON public.indicator_snapshots(decision_id);
CREATE INDEX idx_indicator_snapshots_asset_tf ON public.indicator_snapshots(asset_id, timeframe_primary);

ALTER TABLE public.indicator_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public read indicator_snapshots"
  ON public.indicator_snapshots FOR SELECT USING (false);

CREATE POLICY "Service write indicator_snapshots"
  ON public.indicator_snapshots FOR ALL USING (true) WITH CHECK (true);

-- 2) INDICATOR OUTCOME LINKS — post-close outcome attachment
CREATE TABLE public.indicator_outcome_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.paper_decisions(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.paper_trades(id) ON DELETE SET NULL,
  direction_correct SMALLINT NOT NULL DEFAULT 0,
  return_r NUMERIC,
  mae_r NUMERIC,
  mfe_r NUMERIC,
  outcome_label TEXT,
  horizon_realized_dir TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outcome_links_decision ON public.indicator_outcome_links(decision_id);
CREATE INDEX idx_outcome_links_trade ON public.indicator_outcome_links(trade_id);

ALTER TABLE public.indicator_outcome_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public read indicator_outcome_links"
  ON public.indicator_outcome_links FOR SELECT USING (false);

CREATE POLICY "Service write indicator_outcome_links"
  ON public.indicator_outcome_links FOR ALL USING (true) WITH CHECK (true);

-- 3) INDICATOR RELIABILITY — per-indicator self-learning scores
CREATE TABLE public.indicator_reliability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '4h',
  regime_label TEXT NOT NULL DEFAULT 'Unknown',
  indicator_name TEXT NOT NULL,
  sample_n INTEGER NOT NULL DEFAULT 0,
  diracc_lift NUMERIC NOT NULL DEFAULT 0,
  ev_lift NUMERIC NOT NULL DEFAULT 0,
  false_positive_rate NUMERIC NOT NULL DEFAULT 0,
  last_updated_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, timeframe, regime_label, indicator_name)
);

CREATE INDEX idx_indicator_reliability_lookup
  ON public.indicator_reliability(asset_id, timeframe, regime_label);

ALTER TABLE public.indicator_reliability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read indicator_reliability"
  ON public.indicator_reliability FOR SELECT USING (true);

CREATE POLICY "Service write indicator_reliability"
  ON public.indicator_reliability FOR ALL USING (true) WITH CHECK (true);

-- 4) INDICATOR PATTERNS — discovered conditional rules
CREATE TABLE public.indicator_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT NOT NULL DEFAULT 'global',
  timeframe TEXT NOT NULL DEFAULT '4h',
  regime_label TEXT NOT NULL DEFAULT 'Unknown',
  conditions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  support_n_decisions INTEGER NOT NULL DEFAULT 0,
  support_n_trades INTEGER NOT NULL DEFAULT 0,
  diracc_uplift NUMERIC NOT NULL DEFAULT 0,
  ev_uplift NUMERIC NOT NULL DEFAULT 0,
  stability_score NUMERIC NOT NULL DEFAULT 0,
  confidence_tier TEXT NOT NULL DEFAULT 'low',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_validated_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, timeframe, regime_label, conditions_json)
);

CREATE INDEX idx_patterns_active ON public.indicator_patterns(asset_id, timeframe, is_active);

ALTER TABLE public.indicator_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read indicator_patterns"
  ON public.indicator_patterns FOR SELECT USING (true);

CREATE POLICY "Service write indicator_patterns"
  ON public.indicator_patterns FOR ALL USING (true) WITH CHECK (true);

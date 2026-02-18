
-- ═══════════════════════════════════════════════════════════════════
-- ATLAS Brain Pillar — Canonical Learning Audit Log
-- ═══════════════════════════════════════════════════════════════════

-- A1) atlas_brain_log — append-only audit of every belief update
CREATE TABLE IF NOT EXISTS public.atlas_brain_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),

  -- what was updated
  target_table text NOT NULL,         -- e.g. 'scenario_reputation', 'strategy_reputation', 'indicator_reliability'
  target_key text NOT NULL,           -- e.g. scenario_key or blueprint_id
  symbol text,

  -- what changed
  update_type text NOT NULL,          -- BAYESIAN_UPDATE | EMA_UPDATE | REPUTATION_BLEND | CONFIDENCE_RECAL | POLICY_TUNE
  prior_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  posterior_state jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- provenance: which memory events drove this update
  memory_event_ids uuid[] NOT NULL DEFAULT '{}',

  -- metadata
  source_function text NOT NULL,      -- e.g. 'brain-update', 'scenario-reputation-update'
  notes text,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS brain_log_trace_idx ON public.atlas_brain_log(trace_id);
CREATE INDEX IF NOT EXISTS brain_log_target_idx ON public.atlas_brain_log(target_table, target_key);
CREATE INDEX IF NOT EXISTS brain_log_ts_idx ON public.atlas_brain_log(ts DESC);
CREATE INDEX IF NOT EXISTS brain_log_symbol_idx ON public.atlas_brain_log(symbol, ts DESC);

-- RLS: append-only, read by authenticated
ALTER TABLE public.atlas_brain_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_log_read" ON public.atlas_brain_log;
CREATE POLICY "brain_log_read"
  ON public.atlas_brain_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "brain_log_write" ON public.atlas_brain_log;
CREATE POLICY "brain_log_write"
  ON public.atlas_brain_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- A2) atlas_brain_sources — registry of approved brain consumers (learning modules)
CREATE TABLE IF NOT EXISTS public.atlas_brain_sources (
  source text PRIMARY KEY,
  owner_function text NOT NULL,
  target_tables text[] NOT NULL DEFAULT '{}',
  description text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atlas_brain_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_sources_read" ON public.atlas_brain_sources;
CREATE POLICY "brain_sources_read"
  ON public.atlas_brain_sources FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "brain_sources_write" ON public.atlas_brain_sources;
CREATE POLICY "brain_sources_write"
  ON public.atlas_brain_sources FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Seed baseline brain sources
INSERT INTO public.atlas_brain_sources (source, owner_function, target_tables, description) VALUES
  ('scenario_reputation', 'brain-update', ARRAY['scenario_reputation'], 'Bayesian + EMA scenario win-rate updates'),
  ('strategy_reputation', 'brain-update', ARRAY['strategy_reputation'], 'Strategy blueprint reputation EMA blending'),
  ('confidence_calibration', 'confidence-recalc', ARRAY['paper_decisions', 'confidence_events'], 'Execution probability and belief recalculation'),
  ('indicator_reliability', 'brain-update', ARRAY['indicator_reliability'], 'Per-indicator directional accuracy tracking'),
  ('graduation', 'brain-update', ARRAY['graduation_status'], 'Maturity level progression based on outcomes'),
  ('risk_tuning', 'brain-update', ARRAY['paper_policy'], 'Adaptive risk parameter adjustments from outcome data')
ON CONFLICT (source) DO NOTHING;

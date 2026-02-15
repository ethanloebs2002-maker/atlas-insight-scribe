
-- ============================================================
-- ATLAS v1.6.1a — Anomaly State Machine tables
-- ============================================================

-- RT anomaly samples (Loop A output)
CREATE TABLE public.anomaly_rt_samples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id TEXT NOT NULL DEFAULT 'BTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anomaly_score NUMERIC NOT NULL DEFAULT 0,
  proposed_state TEXT NOT NULL DEFAULT 'NORMAL',
  root_causes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics_json JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.anomaly_rt_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.anomaly_rt_samples FOR SELECT
  USING (public.is_user_active(auth.uid()));

CREATE POLICY "Service role full access on anomaly_rt_samples"
  ON public.anomaly_rt_samples FOR ALL
  USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_anomaly_rt_asset_time ON public.anomaly_rt_samples (asset_id, created_at DESC);

-- Stable anomaly state (K-bar smoothed output)
CREATE TABLE public.anomaly_stable_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id TEXT NOT NULL UNIQUE,
  stable_state TEXT NOT NULL DEFAULT 'NORMAL',
  stable_score NUMERIC NOT NULL DEFAULT 0,
  consecutive_warn INTEGER NOT NULL DEFAULT 0,
  consecutive_halt INTEGER NOT NULL DEFAULT 0,
  consecutive_normal INTEGER NOT NULL DEFAULT 0,
  cooldown_until TIMESTAMPTZ,
  cooldown_reason TEXT,
  root_causes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_adjustments_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_transition_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.anomaly_stable_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users on stable state"
  ON public.anomaly_stable_state FOR SELECT
  USING (public.is_user_active(auth.uid()));

CREATE POLICY "Service role full access on anomaly_stable_state"
  ON public.anomaly_stable_state FOR ALL
  USING (true) WITH CHECK (true);

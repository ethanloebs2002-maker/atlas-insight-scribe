
-- ═══════════════════════════════════════════════════════════════
-- ATLAS v1.6 — AISL: Adaptive Intelligence & Safety Layer
-- ═══════════════════════════════════════════════════════════════

-- 1) SYSTEM STATUS — Output Mode State Machine
CREATE TABLE public.system_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id text NOT NULL DEFAULT 'GLOBAL',
  output_mode text NOT NULL DEFAULT 'NORMAL' CHECK (output_mode IN ('NORMAL', 'CAUTION', 'ESCALATED')),
  reason text,
  anomaly_halt boolean NOT NULL DEFAULT false,
  learning_frozen boolean NOT NULL DEFAULT false,
  last_anomaly_check timestamp with time zone,
  escalation_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (asset_id)
);

ALTER TABLE public.system_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read system_status"
  ON public.system_status FOR SELECT
  USING (true);

CREATE POLICY "Service write system_status"
  ON public.system_status FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert the global default row
INSERT INTO public.system_status (asset_id, output_mode) VALUES ('GLOBAL', 'NORMAL');

-- 2) ANOMALY EVENTS — Log of detected anomalies
CREATE TABLE public.anomaly_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id text NOT NULL DEFAULT 'GLOBAL',
  event_type text NOT NULL, -- 'VOLATILITY_SPIKE', 'REGIME_BREAK', 'DATA_GAP', 'INTEGRITY_COLLAPSE'
  severity text NOT NULL DEFAULT 'warn' CHECK (severity IN ('info', 'warn', 'critical')),
  description text,
  metrics_json jsonb DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.anomaly_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read anomaly_events"
  ON public.anomaly_events FOR SELECT
  USING (true);

CREATE POLICY "Service write anomaly_events"
  ON public.anomaly_events FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3) PATTERN TIERS — Promotion lifecycle for discovered patterns
CREATE TABLE public.pattern_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_id uuid NOT NULL REFERENCES public.indicator_patterns(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  tier text NOT NULL DEFAULT 'candidate' CHECK (tier IN ('candidate', 'validated', 'promoted', 'expired')),
  promoted_at timestamp with time zone,
  validated_at timestamp with time zone,
  expired_at timestamp with time zone,
  validation_passes integer NOT NULL DEFAULT 0,
  validation_failures integer NOT NULL DEFAULT 0,
  last_check_ts timestamp with time zone NOT NULL DEFAULT now(),
  regime_context text NOT NULL DEFAULT 'Unknown',
  decay_rate numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pattern_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read pattern_tiers"
  ON public.pattern_tiers FOR SELECT
  USING (true);

CREATE POLICY "Service write pattern_tiers"
  ON public.pattern_tiers FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_pattern_tiers_pattern ON public.pattern_tiers(pattern_id);
CREATE INDEX idx_pattern_tiers_asset_tier ON public.pattern_tiers(asset_id, tier);
CREATE INDEX idx_anomaly_events_asset ON public.anomaly_events(asset_id, created_at DESC);
CREATE INDEX idx_system_status_asset ON public.system_status(asset_id);

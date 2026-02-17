
-- ═══════════════════════════════════════════════════════════════════
-- ATLAS Confidence v1 Migration
-- ═══════════════════════════════════════════════════════════════════

-- A1) paper_decisions: confidence decomposition columns
ALTER TABLE public.paper_decisions
  ADD COLUMN IF NOT EXISTS belief_p numeric,
  ADD COLUMN IF NOT EXISTS execution_p numeric,
  ADD COLUMN IF NOT EXISTS confidence_p numeric,
  ADD COLUMN IF NOT EXISTS confidence_explain jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence_updated_at timestamptz;

-- A2) paper_positions: outcome + outcome_reason (supplements existing close_reason/outcome_label)
ALTER TABLE public.paper_positions
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_reason text;

-- A3) scenario_reputation: add EMA + expires tracking columns
ALTER TABLE public.scenario_reputation
  ADD COLUMN IF NOT EXISTS wins integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS losses integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ema_winrate numeric DEFAULT 0.5;

-- A4) Confidence events table (auditability)
CREATE TABLE IF NOT EXISTS public.confidence_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id uuid REFERENCES public.paper_decisions(id),
  symbol text NOT NULL,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_confidence_events_decision_id ON public.confidence_events(decision_id);
CREATE INDEX IF NOT EXISTS idx_confidence_events_created_at ON public.confidence_events(created_at DESC);

-- RLS for confidence_events (matches engine pattern)
ALTER TABLE public.confidence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read confidence_events"
  ON public.confidence_events
  FOR SELECT
  USING (true);

CREATE POLICY "Service write confidence_events"
  ON public.confidence_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

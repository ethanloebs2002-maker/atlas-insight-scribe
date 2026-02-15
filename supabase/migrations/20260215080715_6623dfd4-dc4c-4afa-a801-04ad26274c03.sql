
-- 1) Create atlas_settings table (single-row config)
CREATE TABLE public.atlas_settings (
  id text PRIMARY KEY DEFAULT 'global',
  eval_cadence_ms bigint NOT NULL DEFAULT 3600000,
  last_auto_eval_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.atlas_settings ENABLE ROW LEVEL SECURITY;

-- Public read so edge functions + UI can read cadence
CREATE POLICY "Public read atlas_settings"
  ON public.atlas_settings FOR SELECT
  USING (true);

-- Service write for edge functions
CREATE POLICY "Service write atlas_settings"
  ON public.atlas_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Admins can update (UI cadence change)
CREATE POLICY "Admins can update atlas_settings"
  ON public.atlas_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed the global row
INSERT INTO public.atlas_settings (id, eval_cadence_ms) VALUES ('global', 3600000);

-- 2) Add provenance columns to paper_decisions
ALTER TABLE public.paper_decisions
  ADD COLUMN IF NOT EXISTS emitted_by text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS emit_run_id text,
  ADD COLUMN IF NOT EXISTS emitted_at timestamp with time zone DEFAULT now();

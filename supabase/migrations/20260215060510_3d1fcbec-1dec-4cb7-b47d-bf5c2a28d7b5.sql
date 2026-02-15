
-- Evaluation Runs table
CREATE TABLE public.evaluation_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  asset_id text NOT NULL,
  timeframe text NOT NULL DEFAULT '4h',
  status text NOT NULL DEFAULT 'STARTED',
  progress_0_100 integer NOT NULL DEFAULT 0,
  eta_seconds integer,
  final_phase text,
  decisions_written_n integer NOT NULL DEFAULT 0,
  error_text text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read evaluation_runs" ON public.evaluation_runs FOR SELECT USING (true);
CREATE POLICY "Service write evaluation_runs" ON public.evaluation_runs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_evaluation_runs_asset ON public.evaluation_runs (asset_id, timeframe, created_at DESC);

-- Debug Trace Events table
CREATE TABLE public.debug_trace_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts timestamp with time zone NOT NULL DEFAULT now(),
  run_id uuid NOT NULL,
  asset_id text NOT NULL,
  timeframe text NOT NULL DEFAULT '4h',
  phase text NOT NULL,
  event_type text NOT NULL DEFAULT 'INFO',
  message text NOT NULL DEFAULT '',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.debug_trace_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read debug_trace_events" ON public.debug_trace_events FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service write debug_trace_events" ON public.debug_trace_events FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_debug_trace_run ON public.debug_trace_events (run_id, ts);

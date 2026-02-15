
-- Pattern Signatures: canonical form of each local pattern
CREATE TABLE public.pattern_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_id uuid NOT NULL,
  signature_hash text NOT NULL,
  canonical_conditions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_tags_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_ts timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_pattern_signatures_hash ON public.pattern_signatures(signature_hash, pattern_id);
CREATE INDEX idx_pattern_signatures_sig ON public.pattern_signatures(signature_hash);

ALTER TABLE public.pattern_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pattern_signatures" ON public.pattern_signatures FOR SELECT USING (true);
CREATE POLICY "Service write pattern_signatures" ON public.pattern_signatures FOR ALL USING (true) WITH CHECK (true);

-- Global Patterns: the registry
CREATE TABLE public.global_patterns (
  signature_hash text NOT NULL PRIMARY KEY,
  description_snippet text NOT NULL DEFAULT '',
  contexts_supported_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  assets_tested_n integer NOT NULL DEFAULT 0,
  assets_success_n integer NOT NULL DEFAULT 0,
  mean_diracc_uplift numeric NOT NULL DEFAULT 0,
  mean_ev_uplift numeric NOT NULL DEFAULT 0,
  portability_score numeric NOT NULL DEFAULT 0,
  stability_score numeric NOT NULL DEFAULT 0,
  first_published_ts timestamp with time zone,
  last_validated_ts timestamp with time zone NOT NULL DEFAULT now(),
  publish_status text NOT NULL DEFAULT 'LOCAL_ONLY',
  canonical_conditions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_tags_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.global_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read global_patterns" ON public.global_patterns FOR SELECT USING (true);
CREATE POLICY "Service write global_patterns" ON public.global_patterns FOR ALL USING (true) WITH CHECK (true);

-- Global Pattern Evidence: per-asset evidence rows
CREATE TABLE public.global_pattern_evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signature_hash text NOT NULL REFERENCES public.global_patterns(signature_hash),
  asset_id text NOT NULL,
  timeframe_class text NOT NULL DEFAULT '4h',
  context_bucket_id text NOT NULL DEFAULT 'default',
  support_n_decisions integer NOT NULL DEFAULT 0,
  support_n_trades integer NOT NULL DEFAULT 0,
  diracc_uplift numeric NOT NULL DEFAULT 0,
  ev_uplift numeric NOT NULL DEFAULT 0,
  stability_score numeric NOT NULL DEFAULT 0,
  last_validated_ts timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_gpe_unique ON public.global_pattern_evidence(signature_hash, asset_id, context_bucket_id);
CREATE INDEX idx_gpe_sig ON public.global_pattern_evidence(signature_hash);

ALTER TABLE public.global_pattern_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read global_pattern_evidence" ON public.global_pattern_evidence FOR SELECT USING (true);
CREATE POLICY "Service write global_pattern_evidence" ON public.global_pattern_evidence FOR ALL USING (true) WITH CHECK (true);

-- Pattern Audit Log: optional manual review (never blocks publication)
CREATE TABLE public.pattern_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signature_hash text NOT NULL REFERENCES public.global_patterns(signature_hash),
  reviewer_note text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT 'NOTE_ONLY',
  created_ts timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.pattern_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit_log" ON public.pattern_audit_log FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert audit_log" ON public.pattern_audit_log FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service write pattern_audit_log" ON public.pattern_audit_log FOR ALL USING (true) WITH CHECK (true);

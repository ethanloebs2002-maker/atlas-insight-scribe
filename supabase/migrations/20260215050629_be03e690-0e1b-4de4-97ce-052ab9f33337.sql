
-- ============================================================
-- ATLAS v1.8.1: Epistemic Awareness + Meta-Cognition
-- ============================================================

-- Section 1: Epistemic Attribution Layer
CREATE TABLE public.epistemic_attributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  asset_id TEXT NOT NULL,
  timeframe_class TEXT NOT NULL DEFAULT '4h',
  data_insufficiency_p NUMERIC NOT NULL DEFAULT 0,
  model_miscalibration_p NUMERIC NOT NULL DEFAULT 0,
  structural_change_p NUMERIC NOT NULL DEFAULT 0,
  data_integrity_failure_p NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.epistemic_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read epistemic_attributions" ON public.epistemic_attributions FOR SELECT USING (true);
CREATE POLICY "Service write epistemic_attributions" ON public.epistemic_attributions FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_epistemic_attr_asset ON public.epistemic_attributions (asset_id, timeframe_class, ts DESC);

-- Section 2: Introspection Snapshots
CREATE TABLE public.introspection_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  asset_id TEXT NOT NULL,
  timeframe_class TEXT NOT NULL DEFAULT '4h',
  reasoning_composition JSONB NOT NULL DEFAULT '{}'::jsonb,
  learning_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrity_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.introspection_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read introspection_snapshots" ON public.introspection_snapshots FOR SELECT USING (true);
CREATE POLICY "Service write introspection_snapshots" ON public.introspection_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_introspection_asset ON public.introspection_snapshots (asset_id, timeframe_class, ts DESC);

-- Section 3: Meta-Evaluation Metrics
CREATE TABLE public.meta_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  asset_id TEXT NOT NULL,
  timeframe_class TEXT NOT NULL DEFAULT '4h',
  calibration_error NUMERIC NOT NULL DEFAULT 0,
  abstention_quality NUMERIC NOT NULL DEFAULT 0,
  learning_instability NUMERIC NOT NULL DEFAULT 0,
  overconfidence_risk NUMERIC NOT NULL DEFAULT 0,
  hypothesis_diversity NUMERIC NOT NULL DEFAULT 0,
  early_warning_lead_time NUMERIC NOT NULL DEFAULT 0,
  false_alarm_rate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read meta_evaluations" ON public.meta_evaluations FOR SELECT USING (true);
CREATE POLICY "Service write meta_evaluations" ON public.meta_evaluations FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_meta_eval_asset ON public.meta_evaluations (asset_id, timeframe_class, ts DESC);

-- Section 4: Maturity State
CREATE TABLE public.maturity_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id TEXT NOT NULL,
  timeframe_class TEXT NOT NULL DEFAULT '4h',
  maturity_level INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC NOT NULL DEFAULT 0,
  last_change_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  promotion_streak INTEGER NOT NULL DEFAULT 0,
  demotion_streak INTEGER NOT NULL DEFAULT 0,
  cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, timeframe_class)
);
ALTER TABLE public.maturity_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read maturity_states" ON public.maturity_states FOR SELECT USING (true);
CREATE POLICY "Service write maturity_states" ON public.maturity_states FOR ALL USING (true) WITH CHECK (true);

-- Section 5: Authority State
CREATE TABLE public.authority_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id TEXT NOT NULL,
  timeframe_class TEXT NOT NULL DEFAULT '4h',
  authority_level INTEGER NOT NULL DEFAULT 0,
  last_change_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  rationale_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, timeframe_class)
);
ALTER TABLE public.authority_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read authority_states" ON public.authority_states FOR SELECT USING (true);
CREATE POLICY "Service write authority_states" ON public.authority_states FOR ALL USING (true) WITH CHECK (true);

-- Section 7: Admin Messages
CREATE TYPE public.admin_sender_type AS ENUM ('admin', 'atlas');
CREATE TYPE public.admin_msg_category AS ENUM ('maturity', 'warning', 'audit', 'manual');
CREATE TYPE public.admin_msg_severity AS ENUM ('info', 'watch', 'important');

CREATE TABLE public.admin_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sender_type admin_sender_type NOT NULL DEFAULT 'atlas',
  category admin_msg_category NOT NULL DEFAULT 'maturity',
  severity admin_msg_severity NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT false,
  asset_id TEXT,
  responded_by UUID REFERENCES auth.users(id),
  response_text TEXT
);
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

-- Admin messages: only admins can read/write
CREATE POLICY "Admins can read admin_messages" ON public.admin_messages
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert admin_messages" ON public.admin_messages
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update admin_messages" ON public.admin_messages
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service write admin_messages" ON public.admin_messages
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_admin_messages_unread ON public.admin_messages (read, created_at DESC);

-- Maturity level labels for reference
COMMENT ON TABLE public.maturity_states IS 'ML0=Reactive, ML1=Uncertainty-Aware, ML2=Epistemically-Aware, ML3=Self-Evaluative, ML4=Counterfactual-Aware, ML5=Self-Reframing';
COMMENT ON TABLE public.authority_states IS 'AL0=Observe, AL1=Notify, AL2=Light-Regulation, AL3=Learning-Regulation';

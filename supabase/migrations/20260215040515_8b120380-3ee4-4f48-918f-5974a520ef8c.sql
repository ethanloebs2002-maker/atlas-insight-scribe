
-- ============================================================
-- ATLAS v1.8 — News Learning Engine (NLE) Schema
-- ============================================================

-- 1) News Sources (publisher reliability baselines)
CREATE TABLE public.news_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  domain text,
  reliability_weight numeric NOT NULL DEFAULT 0.5,
  tier text NOT NULL DEFAULT 'C',  -- A/B/C
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_sources" ON public.news_sources FOR SELECT USING (true);
CREATE POLICY "Service write news_sources" ON public.news_sources FOR ALL USING (true) WITH CHECK (true);

-- 2) News Items
CREATE TABLE public.news_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id text UNIQUE,
  title text NOT NULL,
  snippet text,
  canonical_url text,
  publisher text,
  source_id uuid REFERENCES public.news_sources(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  ingested_at timestamptz NOT NULL DEFAULT now(),
  dedupe_hash text UNIQUE,
  categories_json jsonb DEFAULT '[]'::jsonb,
  raw_metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_items" ON public.news_items FOR SELECT USING (true);
CREATE POLICY "Service write news_items" ON public.news_items FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_news_items_published ON public.news_items(published_at DESC);
CREATE INDEX idx_news_items_publisher ON public.news_items(publisher);

-- 3) News-Asset Links
CREATE TABLE public.news_asset_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id uuid NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  link_confidence numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_asset_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_asset_links" ON public.news_asset_links FOR SELECT USING (true);
CREATE POLICY "Service write news_asset_links" ON public.news_asset_links FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_news_asset_links_asset ON public.news_asset_links(asset_id);
CREATE INDEX idx_news_asset_links_news ON public.news_asset_links(news_id);

-- 4) Psych Impact Vectors
CREATE TABLE public.news_psych_impact (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id uuid NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE UNIQUE,
  fear_score numeric NOT NULL DEFAULT 0,
  greed_fomo_score numeric NOT NULL DEFAULT 0,
  uncertainty_score numeric NOT NULL DEFAULT 0,
  urgency_score numeric NOT NULL DEFAULT 0,
  authority_score numeric NOT NULL DEFAULT 0,
  outrage_conflict_score numeric NOT NULL DEFAULT 0,
  contagion_score numeric NOT NULL DEFAULT 0,
  narrative_pressure_score numeric NOT NULL DEFAULT 0,
  extraction_confidence numeric NOT NULL DEFAULT 0,
  extraction_method text NOT NULL DEFAULT 'heuristic',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_psych_impact ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_psych_impact" ON public.news_psych_impact FOR SELECT USING (true);
CREATE POLICY "Service write news_psych_impact" ON public.news_psych_impact FOR ALL USING (true) WITH CHECK (true);

-- 5) Agenda Signals
CREATE TABLE public.news_agenda_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id uuid NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE UNIQUE,
  speculation_level numeric NOT NULL DEFAULT 0,
  framing_asymmetry numeric NOT NULL DEFAULT 0,
  incentive_flags_json jsonb DEFAULT '[]'::jsonb,
  source_disagreement numeric NOT NULL DEFAULT 0,
  clickbait_intensity numeric NOT NULL DEFAULT 0,
  agenda_uncertainty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_agenda_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_agenda_signals" ON public.news_agenda_signals FOR SELECT USING (true);
CREATE POLICY "Service write news_agenda_signals" ON public.news_agenda_signals FOR ALL USING (true) WITH CHECK (true);

-- 6) Market Reactions
CREATE TABLE public.news_market_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id uuid NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  base_ts timestamptz NOT NULL,
  regime_label text NOT NULL DEFAULT 'Unknown',
  horizon_metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  abnormality_score numeric NOT NULL DEFAULT 0,
  reaction_confidence numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_market_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_market_reactions" ON public.news_market_reactions FOR SELECT USING (true);
CREATE POLICY "Service write news_market_reactions" ON public.news_market_reactions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_news_reactions_asset ON public.news_market_reactions(asset_id, base_ts DESC);
CREATE UNIQUE INDEX idx_news_reactions_unique ON public.news_market_reactions(news_id, asset_id);

-- 7) Narrative Clusters
CREATE TABLE public.news_narratives (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id text NOT NULL,
  topic_label text NOT NULL,
  topic_embedding jsonb DEFAULT '[]'::jsonb,
  first_seen_ts timestamptz NOT NULL DEFAULT now(),
  last_seen_ts timestamptz NOT NULL DEFAULT now(),
  momentum_24h numeric NOT NULL DEFAULT 0,
  momentum_7d numeric NOT NULL DEFAULT 0,
  article_count integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_narratives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_narratives" ON public.news_narratives FOR SELECT USING (true);
CREATE POLICY "Service write news_narratives" ON public.news_narratives FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_news_narratives_asset ON public.news_narratives(asset_id, is_active);

-- 8) Corroboration
CREATE TABLE public.news_corroboration (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  narrative_id uuid NOT NULL REFERENCES public.news_narratives(id) ON DELETE CASCADE,
  corroboration_score numeric NOT NULL DEFAULT 0,
  disagreement_score numeric NOT NULL DEFAULT 0,
  sources_count integer NOT NULL DEFAULT 0,
  tier_a_sources_count integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_corroboration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_corroboration" ON public.news_corroboration FOR SELECT USING (true);
CREATE POLICY "Service write news_corroboration" ON public.news_corroboration FOR ALL USING (true) WITH CHECK (true);

-- 9) News Feature Rows (learning dataset)
CREATE TABLE public.news_feature_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id uuid NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  timeframe_class text NOT NULL DEFAULT '4h',
  regime_label text NOT NULL DEFAULT 'Unknown',
  vol_band text,
  liquidity_tier text,
  source_reliability numeric NOT NULL DEFAULT 0.5,
  psych_impact_json jsonb DEFAULT '{}'::jsonb,
  agenda_signals_json jsonb DEFAULT '{}'::jsonb,
  event_labels_json jsonb DEFAULT '[]'::jsonb,
  narrative_id uuid REFERENCES public.news_narratives(id),
  corroboration_score numeric NOT NULL DEFAULT 0,
  engine_state_snapshot_json jsonb DEFAULT '{}'::jsonb,
  market_reaction_labels_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_feature_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_feature_rows" ON public.news_feature_rows FOR SELECT USING (true);
CREATE POLICY "Service write news_feature_rows" ON public.news_feature_rows FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_news_features_asset ON public.news_feature_rows(asset_id, regime_label);

-- 10) News Graduation (per asset/timeframe/regime)
CREATE TABLE public.news_graduation (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id text NOT NULL,
  timeframe_class text NOT NULL DEFAULT '4h',
  regime_label text NOT NULL DEFAULT 'Unknown',
  graduation_level integer NOT NULL DEFAULT 0,  -- N0=0, N1=1, N2=2, N3=3
  n_linked_events integer NOT NULL DEFAULT 0,
  n_trades_in_news_state integer NOT NULL DEFAULT 0,
  dir_acc_uplift numeric DEFAULT 0,
  ev_uplift numeric DEFAULT 0,
  stability_recent numeric DEFAULT 0,
  agenda_penalty_applied boolean NOT NULL DEFAULT false,
  influence_mode text NOT NULL DEFAULT 'OFF',
  integrity_pass boolean NOT NULL DEFAULT false,
  last_evaluated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asset_id, timeframe_class, regime_label)
);
ALTER TABLE public.news_graduation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_graduation" ON public.news_graduation FOR SELECT USING (true);
CREATE POLICY "Service write news_graduation" ON public.news_graduation FOR ALL USING (true) WITH CHECK (true);

-- 11) News-Narrative Links (which articles belong to which narrative)
CREATE TABLE public.news_narrative_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id uuid NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE,
  narrative_id uuid NOT NULL REFERENCES public.news_narratives(id) ON DELETE CASCADE,
  relevance_score numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(news_id, narrative_id)
);
ALTER TABLE public.news_narrative_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news_narrative_links" ON public.news_narrative_links FOR SELECT USING (true);
CREATE POLICY "Service write news_narrative_links" ON public.news_narrative_links FOR ALL USING (true) WITH CHECK (true);

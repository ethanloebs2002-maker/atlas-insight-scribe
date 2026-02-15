
-- ═══════════════════════════════════════════════════════════════
-- ATLAS v1.3: Asset Similarity Engine + Transfer Learning Tables
-- ═══════════════════════════════════════════════════════════════

-- Asset fingerprints: rolling feature vectors for similarity computation
CREATE TABLE public.asset_fingerprints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id TEXT NOT NULL,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  timeframe TEXT NOT NULL DEFAULT '4h',
  -- Feature vector components
  volatility_rank NUMERIC NOT NULL DEFAULT 0,
  momentum_score NUMERIC NOT NULL DEFAULT 0,
  trend_strength NUMERIC NOT NULL DEFAULT 0,
  volume_profile NUMERIC NOT NULL DEFAULT 0,
  mean_reversion_score NUMERIC NOT NULL DEFAULT 0,
  correlation_btc NUMERIC NOT NULL DEFAULT 0,
  regime_label TEXT NOT NULL DEFAULT 'Unknown',
  atr_normalized NUMERIC NOT NULL DEFAULT 0,
  rsi_avg NUMERIC NOT NULL DEFAULT 50,
  macd_trend NUMERIC NOT NULL DEFAULT 0,
  -- Raw fingerprint as JSON array for cosine similarity
  fingerprint_vector JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE(asset_id, timeframe)
);

ALTER TABLE public.asset_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read asset_fingerprints" ON public.asset_fingerprints FOR SELECT USING (true);
CREATE POLICY "Service write asset_fingerprints" ON public.asset_fingerprints FOR ALL USING (true) WITH CHECK (true);

-- Transfer learning priors: stores transferred weights from donor assets
CREATE TABLE public.transfer_priors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_asset TEXT NOT NULL,
  donor_asset TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '4h',
  similarity_score NUMERIC NOT NULL DEFAULT 0,
  transfer_weight NUMERIC NOT NULL DEFAULT 0,
  initial_transfer_weight NUMERIC NOT NULL DEFAULT 0,
  local_decisions_at_transfer INTEGER NOT NULL DEFAULT 0,
  current_local_decisions INTEGER NOT NULL DEFAULT 0,
  -- What was transferred
  signal_weights_json JSONB DEFAULT NULL,
  regime_map_json JSONB DEFAULT NULL,
  atr_sizing_json JSONB DEFAULT NULL,
  calibration_shape_json JSONB DEFAULT NULL,
  -- Safety
  integrity_pass BOOLEAN NOT NULL DEFAULT true,
  contradiction_count INTEGER NOT NULL DEFAULT 0,
  discarded BOOLEAN NOT NULL DEFAULT false,
  discard_reason TEXT DEFAULT NULL,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_decay_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(target_asset, donor_asset, timeframe)
);

ALTER TABLE public.transfer_priors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read transfer_priors" ON public.transfer_priors FOR SELECT USING (true);
CREATE POLICY "Service write transfer_priors" ON public.transfer_priors FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- PostgreSQL Functions for Similarity Computation
-- ═══════════════════════════════════════════════════════════════

-- Cosine similarity between two JSONB vectors
CREATE OR REPLACE FUNCTION public.cosine_similarity(a JSONB, b JSONB)
RETURNS NUMERIC AS $$
DECLARE
  dot_product NUMERIC := 0;
  norm_a NUMERIC := 0;
  norm_b NUMERIC := 0;
  i INTEGER;
  va NUMERIC;
  vb NUMERIC;
  len INTEGER;
BEGIN
  len := jsonb_array_length(a);
  IF len != jsonb_array_length(b) OR len = 0 THEN
    RETURN 0;
  END IF;
  
  FOR i IN 0..len-1 LOOP
    va := (a->i)::NUMERIC;
    vb := (b->i)::NUMERIC;
    dot_product := dot_product + (va * vb);
    norm_a := norm_a + (va * va);
    norm_b := norm_b + (vb * vb);
  END LOOP;
  
  IF norm_a = 0 OR norm_b = 0 THEN
    RETURN 0;
  END IF;
  
  RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Find similar assets above threshold
CREATE OR REPLACE FUNCTION public.find_similar_assets(
  p_asset_id TEXT,
  p_timeframe TEXT DEFAULT '4h',
  p_threshold NUMERIC DEFAULT 0.80
)
RETURNS TABLE(
  asset_id TEXT,
  similarity NUMERIC,
  graduation_level INTEGER,
  is_stable BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH target AS (
    SELECT fingerprint_vector
    FROM public.asset_fingerprints
    WHERE asset_fingerprints.asset_id = p_asset_id 
      AND asset_fingerprints.timeframe = p_timeframe
    LIMIT 1
  )
  SELECT 
    af.asset_id,
    public.cosine_similarity(t.fingerprint_vector, af.fingerprint_vector) AS similarity,
    COALESCE(gs.graduation_level, 0) AS graduation_level,
    COALESCE(gs.graduation_level >= 1 AND gs.integrity_gating_pass, false) AS is_stable
  FROM public.asset_fingerprints af
  CROSS JOIN target t
  LEFT JOIN public.graduation_status gs 
    ON gs.asset_id = af.asset_id AND gs.timeframe = p_timeframe
  WHERE af.asset_id != p_asset_id
    AND af.timeframe = p_timeframe
    AND public.cosine_similarity(t.fingerprint_vector, af.fingerprint_vector) >= p_threshold
  ORDER BY similarity DESC;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- Exponential decay function for transfer weight
CREATE OR REPLACE FUNCTION public.compute_transfer_decay(
  initial_weight NUMERIC,
  local_decisions_at_transfer INTEGER,
  current_local_decisions INTEGER,
  half_life INTEGER DEFAULT 50
)
RETURNS NUMERIC AS $$
DECLARE
  delta INTEGER;
  decay_factor NUMERIC;
BEGIN
  delta := GREATEST(0, current_local_decisions - local_decisions_at_transfer);
  decay_factor := power(0.5, delta::NUMERIC / half_life::NUMERIC);
  RETURN initial_weight * decay_factor;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;


-- ═══════════════════════════════════════════════════════════════════════════
-- ATLAS 2.0 — COMPLETE DATABASE MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════

-- WHALE INTELLIGENCE LAYER
CREATE TABLE IF NOT EXISTS whale_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  lot_win_rate NUMERIC NOT NULL CHECK (lot_win_rate >= 0 AND lot_win_rate <= 1),
  realized_pnl_usd NUMERIC NOT NULL,
  trade_count INT NOT NULL CHECK (trade_count >= 0),
  avg_hold_time_hours NUMERIC,
  avg_position_size_usd NUMERIC,
  last_30d_win_rate NUMERIC,
  last_30d_pnl NUMERIC,
  last_30d_trade_count INT DEFAULT 0,
  last_trade_ts TIMESTAMPTZ,
  integrity_score NUMERIC NOT NULL CHECK (integrity_score >= 0 AND integrity_score <= 1),
  attribution_confidence NUMERIC NOT NULL CHECK (attribution_confidence >= 0 AND attribution_confidence <= 1),
  consistency_score NUMERIC DEFAULT 0.5,
  is_active BOOLEAN DEFAULT true,
  is_elite BOOLEAN DEFAULT false,
  tier INT DEFAULT 0 CHECK (tier >= 0 AND tier <= 3),
  last_evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wallet_address, asset_id)
);

CREATE TABLE IF NOT EXISTS whale_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whale_wallet_id UUID REFERENCES whale_wallets(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  size_usd NUMERIC NOT NULL CHECK (size_usd > 0),
  size_tokens NUMERIC,
  entry_price NUMERIC NOT NULL CHECK (entry_price > 0),
  exit_price NUMERIC CHECK (exit_price > 0 OR exit_price IS NULL),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  hold_time_hours NUMERIC,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'LIQUIDATED')),
  pnl_usd NUMERIC,
  pnl_r NUMERIC,
  source TEXT,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  chain TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whale_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'NEUTRAL')),
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  whale_count INT NOT NULL,
  elite_whale_count INT NOT NULL,
  net_bias NUMERIC NOT NULL CHECK (net_bias >= -1 AND net_bias <= 1),
  avg_whale_win_rate NUMERIC NOT NULL,
  avg_whale_integrity NUMERIC NOT NULL,
  total_position_size_usd NUMERIC NOT NULL,
  long_position_size_usd NUMERIC NOT NULL,
  short_position_size_usd NUMERIC NOT NULL,
  top_whales_json JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lookback_hours INT NOT NULL,
  UNIQUE(asset_id, timeframe, computed_at)
);

-- CONSENSUS ENGINE LAYER
CREATE TABLE IF NOT EXISTS consensus_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  asset_id TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  horizon TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'NEUTRAL')),
  consensus_score NUMERIC NOT NULL CHECK (consensus_score >= 0 AND consensus_score <= 1),
  final_probability NUMERIC NOT NULL CHECK (final_probability >= 0 AND final_probability <= 1),
  indicator_signal JSONB NOT NULL,
  news_signal JSONB NOT NULL,
  historical_signal JSONB NOT NULL,
  sentiment_signal JSONB NOT NULL,
  pattern_signal JSONB NOT NULL,
  learning_signal JSONB NOT NULL,
  whale_signal JSONB NOT NULL,
  agreement_rate NUMERIC NOT NULL,
  diversity_score NUMERIC NOT NULL,
  consilience_level TEXT CHECK (consilience_level IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'EXTREME')),
  whale_divergence BOOLEAN DEFAULT false,
  groupthink_warning BOOLEAN DEFAULT false,
  uncertainty_escalation BOOLEAN DEFAULT false,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('TRADE', 'ABSTAIN', 'BLOCKED')),
  block_reason TEXT,
  regime TEXT,
  ref_price NUMERIC,
  version_tag TEXT DEFAULT 'v2.0.0',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paper_decision_id UUID REFERENCES paper_decisions(id) ON DELETE SET NULL
);

-- META-COGNITION LAYER
CREATE TABLE IF NOT EXISTS meta_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT,
  timeframe TEXT,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'OVERCONFIDENCE_DETECTED','UNDERCONFIDENCE_DETECTED','PATTERN_VALIDATED',
    'PATTERN_INVALIDATED','REGIME_BIAS_DETECTED','PILLAR_RELIABILITY_SHIFT',
    'WHALE_DIVERGENCE_PATTERN','TRANSFER_LEARNING_SUCCESS','POLICY_OPTIMIZATION_PROPOSAL'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_json JSONB NOT NULL,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  severity TEXT CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  actionable BOOLEAN DEFAULT false,
  proposed_action TEXT,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calibration_curves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  regime TEXT,
  pillar TEXT NOT NULL CHECK (pillar IN (
    'indicators', 'news', 'historical', 'sentiment',
    'patterns', 'learning', 'whales', 'consensus'
  )),
  predicted_prob NUMERIC NOT NULL CHECK (predicted_prob >= 0 AND predicted_prob <= 1),
  actual_win_rate NUMERIC NOT NULL CHECK (actual_win_rate >= 0 AND actual_win_rate <= 1),
  sample_size INT NOT NULL,
  calibration_delta NUMERIC NOT NULL,
  confidence_interval NUMERIC,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asset_id, timeframe, regime, pillar, predicted_prob, window_end)
);

-- PATTERN LIBRARY ENHANCEMENTS
CREATE TABLE IF NOT EXISTS pattern_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id TEXT UNIQUE NOT NULL,
  pattern_name TEXT NOT NULL,
  required_signals JSONB NOT NULL,
  optional_signals JSONB,
  regime_filter TEXT[],
  total_occurrences INT DEFAULT 0,
  win_count INT DEFAULT 0,
  loss_count INT DEFAULT 0,
  win_rate NUMERIC,
  avg_r NUMERIC,
  performance_by_regime JSONB,
  performance_by_asset JSONB,
  performance_by_timeframe JSONB,
  tier INT DEFAULT 0 CHECK (tier >= 0 AND tier <= 3),
  status TEXT DEFAULT 'DISCOVERY' CHECK (status IN ('DISCOVERY', 'TESTING', 'VALIDATED', 'GRADUATED', 'DEPRECATED')),
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_occurrence_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HISTORICAL ANALOG MATCHING
CREATE TABLE IF NOT EXISTS historical_analogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT NOT NULL,
  current_state_json JSONB NOT NULL,
  snapshot_ts TIMESTAMPTZ NOT NULL,
  matched_period_start TIMESTAMPTZ NOT NULL,
  matched_period_end TIMESTAMPTZ NOT NULL,
  similarity_score NUMERIC NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
  historical_direction TEXT CHECK (historical_direction IN ('UP', 'DOWN', 'NEUTRAL')),
  historical_return_pct NUMERIC,
  historical_volatility NUMERIC,
  outcome_window_hours INT NOT NULL,
  matched_features TEXT[],
  feature_weights JSONB,
  prediction_confidence NUMERIC CHECK (prediction_confidence >= 0 AND prediction_confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_whale_wallets_elite ON whale_wallets(asset_id, is_elite, lot_win_rate DESC) WHERE is_active = true;
CREATE INDEX idx_whale_wallets_active ON whale_wallets(asset_id, is_active, last_trade_ts DESC);
CREATE INDEX idx_whale_positions_open ON whale_positions(asset_id, status, opened_at DESC) WHERE status = 'OPEN';
CREATE INDEX idx_whale_positions_closed ON whale_positions(whale_wallet_id, closed_at DESC) WHERE status = 'CLOSED';
CREATE INDEX idx_whale_signals_recent ON whale_signals(asset_id, timeframe, computed_at DESC);
CREATE INDEX idx_consensus_decisions_asset ON consensus_decisions(asset_id, created_at DESC);
CREATE INDEX idx_consensus_decisions_run ON consensus_decisions(run_id);
CREATE INDEX idx_consensus_decisions_divergence ON consensus_decisions(asset_id, whale_divergence) WHERE whale_divergence = true;
CREATE INDEX idx_meta_insights_active ON meta_insights(insight_type, status, discovered_at DESC) WHERE status = 'ACTIVE';
CREATE INDEX idx_meta_insights_asset ON meta_insights(asset_id, timeframe, discovered_at DESC);
CREATE INDEX idx_calibration_curves_lookup ON calibration_curves(asset_id, timeframe, pillar, predicted_prob);
CREATE INDEX idx_pattern_catalog_tier ON pattern_catalog(tier DESC, win_rate DESC) WHERE status = 'GRADUATED';
CREATE INDEX idx_pattern_catalog_status ON pattern_catalog(status, total_occurrences DESC);
CREATE INDEX idx_historical_analogs_asset ON historical_analogs(asset_id, snapshot_ts DESC);
CREATE INDEX idx_historical_analogs_similarity ON historical_analogs(asset_id, similarity_score DESC);

-- RLS
ALTER TABLE whale_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE whale_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whale_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_curves ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_analogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON whale_wallets FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON whale_positions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON whale_signals FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON consensus_decisions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON meta_insights FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON calibration_curves FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON pattern_catalog FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON historical_analogs FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY authenticated_read ON whale_wallets FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY authenticated_read ON whale_positions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY authenticated_read ON whale_signals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY authenticated_read ON consensus_decisions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY authenticated_read ON meta_insights FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY authenticated_read ON calibration_curves FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY authenticated_read ON pattern_catalog FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY authenticated_read ON historical_analogs FOR SELECT USING (auth.role() = 'authenticated');

-- TRIGGER: Auto-update whale wallet performance
CREATE OR REPLACE FUNCTION update_whale_wallet_performance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CLOSED' AND OLD.status = 'OPEN' THEN
    UPDATE whale_wallets
    SET
      trade_count = trade_count + 1,
      realized_pnl_usd = realized_pnl_usd + COALESCE(NEW.pnl_usd, 0),
      lot_win_rate = (
        SELECT COUNT(*) FILTER (WHERE pnl_usd > 0)::NUMERIC / GREATEST(COUNT(*), 1)
        FROM whale_positions
        WHERE whale_wallet_id = NEW.whale_wallet_id AND status = 'CLOSED'
      ),
      avg_hold_time_hours = (
        SELECT AVG(hold_time_hours)
        FROM whale_positions
        WHERE whale_wallet_id = NEW.whale_wallet_id AND status = 'CLOSED'
      ),
      last_trade_ts = NEW.closed_at,
      updated_at = NOW()
    WHERE id = NEW.whale_wallet_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_update_whale_performance
AFTER UPDATE ON whale_positions
FOR EACH ROW
EXECUTE FUNCTION update_whale_wallet_performance();

-- SEED: Example patterns
INSERT INTO pattern_catalog (pattern_id, pattern_name, required_signals, win_rate, avg_r, tier, status)
VALUES
('golden_cross_institutional_news', 'Golden Cross + Institutional News',
 '[{"pillar":"indicators","direction":"LONG","min_confidence":0.55},{"pillar":"news","direction":"LONG","min_confidence":0.65},{"pillar":"whales","direction":"LONG","min_confidence":0.60}]'::jsonb,
 0.74, 1.8, 1, 'GRADUATED'),
('whale_divergence_reversal', 'Whale Divergence Reversal',
 '[{"pillar":"whales","direction":"SHORT","min_confidence":0.70},{"pillar":"sentiment","direction":"LONG","min_confidence":0.60}]'::jsonb,
 0.72, 2.1, 2, 'VALIDATED')
ON CONFLICT (pattern_id) DO NOTHING;

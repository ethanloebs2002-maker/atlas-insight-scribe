
-- Helper function for updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Extend paper_decisions with exchange-integration columns
ALTER TABLE public.paper_decisions 
  ADD COLUMN IF NOT EXISTS decision_type text DEFAULT 'TRADE_CANDIDATE',
  ADD COLUMN IF NOT EXISTS version_tag text;

-- Rename paper_trades → paper_trades_legacy (FKs follow the table object)
ALTER TABLE public.paper_trades RENAME TO paper_trades_legacy;

-- 1) paper_policy (versioned, auditable engine config)
CREATE TABLE public.paper_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  version_tag text NOT NULL DEFAULT 'v2.0.0',
  notes text,
  min_prob numeric NOT NULL DEFAULT 0.35,
  min_rr numeric NOT NULL DEFAULT 1.2,
  require_ev_positive boolean NOT NULL DEFAULT true,
  allow_shorts boolean NOT NULL DEFAULT true,
  max_open int NOT NULL DEFAULT 10,
  max_pending int NOT NULL DEFAULT 20,
  fee_bps numeric NOT NULL DEFAULT 6,
  slippage_bps numeric NOT NULL DEFAULT 4,
  latency_ms int NOT NULL DEFAULT 250,
  fill_fraction_min numeric NOT NULL DEFAULT 0.3,
  fill_fraction_max numeric NOT NULL DEFAULT 0.7,
  worst_case_same_candle boolean NOT NULL DEFAULT true,
  expiry_minutes_by_tf jsonb NOT NULL DEFAULT '{"1m":60,"5m":360,"15m":720,"30m":1440,"1h":4320,"4h":8640,"1d":17280}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) paper_orders (exchange-style order book)
CREATE TABLE public.paper_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid,
  policy_id uuid REFERENCES public.paper_policy(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  side text NOT NULL,
  order_type text NOT NULL,
  tif text NOT NULL DEFAULT 'GTC',
  qty numeric NOT NULL DEFAULT 1,
  limit_price numeric,
  stop_price numeric,
  status text NOT NULL DEFAULT 'NEW',
  placed_at timestamptz NOT NULL DEFAULT now(),
  eligible_fill_at timestamptz NOT NULL DEFAULT now(),
  filled_qty numeric NOT NULL DEFAULT 0,
  avg_fill_price numeric,
  oco_group_id uuid,
  reduce_only boolean NOT NULL DEFAULT false,
  position_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) paper_fills (partial fills + fees)
CREATE TABLE public.paper_fills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.paper_orders(id) ON DELETE CASCADE,
  position_id uuid,
  filled_qty numeric NOT NULL DEFAULT 1,
  fill_price numeric NOT NULL,
  fee_paid numeric NOT NULL DEFAULT 0,
  slippage_paid numeric NOT NULL DEFAULT 0,
  ts timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 4) paper_positions (exchange positions / paper trades)
CREATE TABLE public.paper_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid,
  policy_id uuid REFERENCES public.paper_policy(id) ON DELETE SET NULL,
  decision_id uuid REFERENCES public.paper_decisions(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  side text NOT NULL,
  timeframe text NOT NULL DEFAULT '4h',
  horizon text NOT NULL DEFAULT '24h',
  status text NOT NULL DEFAULT 'PENDING_ENTRY',
  qty numeric NOT NULL DEFAULT 1,
  entry_order_id uuid REFERENCES public.paper_orders(id) ON DELETE SET NULL,
  entry_price numeric,
  filled_at timestamptz,
  eligible_close_at timestamptz,
  expires_at timestamptz,
  tp_order_id uuid REFERENCES public.paper_orders(id) ON DELETE SET NULL,
  sl_order_id uuid REFERENCES public.paper_orders(id) ON DELETE SET NULL,
  stop_price numeric,
  tp_price numeric,
  initial_probability_pred numeric,
  initial_probability_source text,
  close_reason text,
  exit_price numeric,
  closed_at timestamptz,
  realized_pnl numeric,
  realized_r numeric,
  realized_pct numeric,
  outcome_label text,
  regime_label text,
  duplicate_key text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5) paper_engine_events (event bus for all state transitions)
CREATE TABLE public.paper_engine_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  run_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  event_type text NOT NULL,
  version_tag text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 6) price_candles (optional OHLC cache)
CREATE TABLE public.price_candles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  timeframe text NOT NULL,
  ts timestamptz NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric,
  UNIQUE(symbol, timeframe, ts)
);

-- Triggers
CREATE TRIGGER tr_policy_updated_at BEFORE UPDATE ON public.paper_policy FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_orders_updated_at BEFORE UPDATE ON public.paper_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_positions_updated_at BEFORE UPDATE ON public.paper_positions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX idx_policy_active ON public.paper_policy(is_active, created_at DESC);
CREATE INDEX idx_orders_status ON public.paper_orders(status, placed_at DESC);
CREATE INDEX idx_orders_position ON public.paper_orders(position_id);
CREATE INDEX idx_orders_oco ON public.paper_orders(oco_group_id);
CREATE INDEX idx_fills_order ON public.paper_fills(order_id, ts DESC);
CREATE INDEX idx_fills_position ON public.paper_fills(position_id, ts DESC);
CREATE INDEX idx_positions_status ON public.paper_positions(status, created_at DESC);
CREATE INDEX idx_positions_symbol_tf ON public.paper_positions(symbol, timeframe, created_at DESC);
CREATE INDEX idx_positions_decision ON public.paper_positions(decision_id);
CREATE INDEX idx_positions_duplicate ON public.paper_positions(duplicate_key);
CREATE INDEX idx_events_ts ON public.paper_engine_events(ts DESC);
CREATE INDEX idx_events_entity ON public.paper_engine_events(entity_type, entity_id, ts DESC);
CREATE INDEX idx_events_run ON public.paper_engine_events(run_id, ts DESC);
CREATE INDEX idx_candles_symbol_tf_ts ON public.price_candles(symbol, timeframe, ts DESC);

-- Views
CREATE OR REPLACE VIEW public.v_active_paper_policy AS
SELECT * FROM public.paper_policy WHERE is_active = true ORDER BY created_at DESC LIMIT 1;

CREATE OR REPLACE VIEW public.v_paper_exposure AS
SELECT
  count(*) FILTER (WHERE status = 'OPEN') AS open_positions,
  count(*) FILTER (WHERE status = 'PENDING_ENTRY') AS pending_positions
FROM public.paper_positions;

-- Bridge view: paper_trades maps both legacy data and new positions to the old shape
-- This preserves backward compatibility for graduation, stats, and UI queries
CREATE OR REPLACE VIEW public.paper_trades AS
SELECT 
  id, asset_id, timeframe, scenario_type, regime_label,
  entry_zone_low, entry_zone_high, trigger_rule,
  stop_level, stop_rule, targets_json,
  fill_price, status, outcome_label,
  return_r, return_pct, exit_price, mae_r, mfe_r,
  decision_id, duplicate_key, time_window_end,
  initial_probability_pred::numeric AS initial_probability_pred,
  initial_probability_source,
  created_at, ts_created, ts_opened, ts_closed,
  evidence_snapshot_json, close_reason
FROM public.paper_trades_legacy
UNION ALL
SELECT 
  p.id,
  p.symbol AS asset_id,
  p.timeframe,
  CASE WHEN p.side = 'LONG' THEN 'bullish' ELSE 'bearish' END AS scenario_type,
  p.regime_label,
  COALESCE(p.entry_price, 0)::numeric AS entry_zone_low,
  COALESCE(p.entry_price, 0)::numeric AS entry_zone_high,
  NULL::text AS trigger_rule,
  p.stop_price AS stop_level,
  NULL::text AS stop_rule,
  CASE WHEN p.tp_price IS NOT NULL 
    THEN jsonb_build_array(jsonb_build_object('price', p.tp_price)) 
    ELSE '[]'::jsonb 
  END AS targets_json,
  p.entry_price AS fill_price,
  CASE p.status WHEN 'PENDING_ENTRY' THEN 'PENDING' ELSE p.status END AS status,
  p.outcome_label,
  p.realized_r AS return_r,
  p.realized_pct AS return_pct,
  p.exit_price,
  NULL::numeric AS mae_r,
  NULL::numeric AS mfe_r,
  p.decision_id,
  p.duplicate_key,
  p.expires_at AS time_window_end,
  p.initial_probability_pred,
  p.initial_probability_source,
  p.created_at,
  p.created_at AS ts_created,
  p.filled_at AS ts_opened,
  p.closed_at AS ts_closed,
  p.meta AS evidence_snapshot_json,
  p.close_reason
FROM public.paper_positions p;

-- RLS on new tables
ALTER TABLE public.paper_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_engine_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_candles ENABLE ROW LEVEL SECURITY;

-- Service role full access (edge functions use service role)
CREATE POLICY "Service write paper_policy" ON public.paper_policy FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write paper_orders" ON public.paper_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write paper_fills" ON public.paper_fills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write paper_positions" ON public.paper_positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write paper_engine_events" ON public.paper_engine_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read price_candles" ON public.price_candles FOR SELECT USING (true);
CREATE POLICY "Service write price_candles" ON public.price_candles FOR ALL USING (true) WITH CHECK (true);

-- Seed default policy
INSERT INTO public.paper_policy (version_tag, notes, is_active) 
VALUES ('v2.0.0', 'Default exchange simulation policy', true);

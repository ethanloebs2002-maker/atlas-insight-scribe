
-- ═══════════════════════════════════════════════════════════════
-- ATLAS MEMORY PILLAR — Canonical Memory Tables
-- ═══════════════════════════════════════════════════════════════

-- A1) atlas_memory_events (append-only canonical memory bank)
CREATE TABLE IF NOT EXISTS public.atlas_memory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- lineage keys
  position_id UUID NULL REFERENCES public.paper_positions(id) ON DELETE CASCADE,
  decision_id UUID NULL REFERENCES public.paper_decisions(id) ON DELETE SET NULL,

  symbol TEXT NOT NULL,
  timeframe TEXT NULL,

  phase TEXT NOT NULL,   -- DECISION_EMIT | ENTRY_FILLED | EXIT_CLOSED | CADENCE_OBSERVE | POLICY_UPDATE | LEARNING_UPDATE
  source TEXT NOT NULL,  -- consensus | execution | market | orderbook | derivatives | whale | news | risk_lab | policy | strategy

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS memory_pos_ts_idx ON public.atlas_memory_events(position_id, ts DESC);
CREATE INDEX IF NOT EXISTS memory_dec_ts_idx ON public.atlas_memory_events(decision_id, ts DESC);
CREATE INDEX IF NOT EXISTS memory_sym_ts_idx ON public.atlas_memory_events(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS memory_src_ts_idx ON public.atlas_memory_events(source, ts DESC);
CREATE INDEX IF NOT EXISTS memory_phase_ts_idx ON public.atlas_memory_events(phase, ts DESC);
CREATE INDEX IF NOT EXISTS memory_trace_idx ON public.atlas_memory_events(trace_id);

-- RLS: append-only
ALTER TABLE public.atlas_memory_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memory_read" ON public.atlas_memory_events;
CREATE POLICY "memory_read"
ON public.atlas_memory_events FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "memory_write" ON public.atlas_memory_events;
CREATE POLICY "memory_write"
ON public.atlas_memory_events FOR INSERT
TO service_role
WITH CHECK (true);

-- No UPDATE/DELETE policies = append-only by RLS

-- A2) atlas_memory_sources (registry of approved probes)
CREATE TABLE IF NOT EXISTS public.atlas_memory_sources (
  source TEXT PRIMARY KEY,
  owner_module TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.atlas_memory_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memory_sources_read" ON public.atlas_memory_sources;
CREATE POLICY "memory_sources_read"
ON public.atlas_memory_sources FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "memory_sources_write" ON public.atlas_memory_sources;
CREATE POLICY "memory_sources_write"
ON public.atlas_memory_sources FOR INSERT
TO service_role
WITH CHECK (true);

-- Seed baseline sources
INSERT INTO public.atlas_memory_sources (source, owner_module, description) VALUES
  ('market', 'supabase/functions/market-data-pump', 'Canonical price/orderbook state summaries'),
  ('orderbook', 'supabase/functions/market-data-pump', 'Order book imbalance and spread summaries'),
  ('derivatives', 'supabase/functions/derivatives-context-snap', 'Funding rate, open interest summaries'),
  ('consensus', 'supabase/functions/paper-engine', 'Decision consensus and scenario summaries'),
  ('execution', 'supabase/functions/paper-engine-tick', 'Entry fill and exit close event data'),
  ('risk_lab', 'supabase/functions/paper-engine-tick', 'Risk profile performance updates'),
  ('policy', 'supabase/functions/paper-engine', 'Policy gating and configuration snapshots'),
  ('whale', 'supabase/functions/whale-signal', 'Whale activity context summaries'),
  ('news', 'supabase/functions/news-engine', 'News sentiment and narrative summaries'),
  ('strategy', 'supabase/functions/strategy-evolve', 'Strategy evolution and tournament results')
ON CONFLICT (source) DO NOTHING;

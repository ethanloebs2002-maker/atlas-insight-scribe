
-- Whale watch events table for tracking scan results and activity
CREATE TABLE public.whale_watch_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'SCAN', -- SCAN, POSITION_OPEN, POSITION_CLOSE, WALLET_PROMOTED, WALLET_DEMOTED
  source text NOT NULL DEFAULT 'exchange', -- exchange, onchain
  whale_wallet_id uuid REFERENCES public.whale_wallets(id),
  direction text, -- LONG, SHORT, NEUTRAL
  size_usd numeric,
  confidence numeric,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  chain text,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_whale_watch_events_asset ON public.whale_watch_events(asset_id, created_at DESC);
CREATE INDEX idx_whale_watch_events_type ON public.whale_watch_events(event_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.whale_watch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read" ON public.whale_watch_events
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "service_role_all" ON public.whale_watch_events
  FOR ALL USING (auth.role() = 'service_role'::text);

-- Enable realtime for whale signals
ALTER PUBLICATION supabase_realtime ADD TABLE public.whale_watch_events;

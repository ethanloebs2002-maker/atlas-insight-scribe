
-- Add workflow status and geometry columns to paper_decisions
-- engine_status tracks the decision lifecycle: PROPOSED → APPROVED → EXECUTING → COMPLETE / REJECTED
ALTER TABLE public.paper_decisions
  ADD COLUMN IF NOT EXISTS engine_status text NOT NULL DEFAULT 'PROPOSED',
  ADD COLUMN IF NOT EXISTS entry_price numeric,
  ADD COLUMN IF NOT EXISTS stop_loss numeric,
  ADD COLUMN IF NOT EXISTS take_profit numeric;

CREATE INDEX IF NOT EXISTS idx_decisions_engine_status 
  ON public.paper_decisions(asset_id, timeframe, engine_status, created_at DESC);

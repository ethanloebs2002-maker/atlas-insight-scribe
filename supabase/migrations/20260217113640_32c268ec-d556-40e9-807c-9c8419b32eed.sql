
-- v_positions_closed: canonical view for metrics
CREATE OR REPLACE VIEW public.v_positions_closed AS
SELECT
  p.id,
  p.symbol,
  upper(p.side) AS side,
  p.status,
  p.filled_at,
  p.closed_at,
  p.entry_price,
  p.exit_price,
  p.stop_price,
  p.tp_price,
  p.realized_pnl,
  p.realized_r,
  p.realized_pct,
  p.close_reason,
  p.outcome,
  p.outcome_label,
  p.decision_id,
  p.timeframe,
  p.horizon,
  CASE
    WHEN p.realized_pnl IS NOT NULL THEN (p.realized_pnl > 0)
    WHEN p.exit_price IS NOT NULL AND p.entry_price IS NOT NULL AND upper(p.side) = 'LONG' THEN (p.exit_price > p.entry_price)
    WHEN p.exit_price IS NOT NULL AND p.entry_price IS NOT NULL AND upper(p.side) = 'SHORT' THEN (p.exit_price < p.entry_price)
    ELSE NULL
  END AS is_win
FROM public.paper_positions p
WHERE p.status = 'CLOSED';

-- v_positions_open: currently active positions
CREATE OR REPLACE VIEW public.v_positions_open AS
SELECT *
FROM public.paper_positions
WHERE status IN ('OPEN', 'PENDING_ENTRY');


create or replace view public.v_whale_trade_outcome_analysis as
select
  t.symbol,
  t.id as trade_id,
  t.filled_at as opened_at,
  t.closed_at,
  t.realized_pnl,
  case when t.realized_pnl > 0 then 1 else 0 end as win,
  s.window_1h_count,
  s.window_6h_count,
  s.window_24h_count,
  s.window_24h_severity_sum,
  s.exchange_inflow_24h_count,
  s.exchange_outflow_24h_count,
  s.flow_bias_24h,
  s.last_event_time,
  s.last_event_type,
  s.last_event_source,
  s.last_event_notional_usd,
  s.last_event_severity
from public.paper_positions t
left join lateral (
  select *
  from public.whale_context_snapshots w
  where w.trade_id = t.id
  order by abs(extract(epoch from (w.snapshot_time - t.filled_at))) asc
  limit 1
) s on true
where t.closed_at is not null;


create or replace view public.v_market_context_trade_outcome as
select
  p.symbol,
  p.id as trade_id,
  p.filled_at as opened_at,
  p.closed_at,
  p.realized_pnl as realized_pnl_usd,
  case when p.realized_pnl > 0 then 1 else 0 end as win,
  s.spread_bps,
  s.ob_imbalance,
  s.depth_concentration,
  s.vol_regime,
  s.rv_1h,
  s.rv_24h,
  s.session_primary,
  s.session_detail
from public.paper_positions p
left join lateral (
  select *
  from public.market_context_snapshots m
  where m.trade_id = p.id
  order by abs(extract(epoch from (m.snapshot_time - p.filled_at))) asc
  limit 1
) s on true
where p.closed_at is not null;

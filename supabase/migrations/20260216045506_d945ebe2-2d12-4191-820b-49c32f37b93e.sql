
-- -------------------------
-- Derivatives context snapshots
-- -------------------------
create table if not exists public.derivatives_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid null,
  trade_id uuid null,
  symbol text not null references public.atlas_assets(symbol) on delete cascade,
  snapshot_time timestamptz not null,
  funding_rate double precision null,
  funding_rate_24h_avg double precision null,
  open_interest_usd numeric null,
  open_interest_change_1h double precision null,
  open_interest_change_24h double precision null,
  long_short_ratio double precision null,
  provider text not null default 'binance_futures',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deriv_ctx_symbol_time_idx on public.derivatives_context_snapshots(symbol, snapshot_time desc);
create index if not exists deriv_ctx_trade_idx on public.derivatives_context_snapshots(trade_id);
create index if not exists deriv_ctx_decision_idx on public.derivatives_context_snapshots(decision_id);

alter table public.derivatives_context_snapshots enable row level security;

create policy "deriv_ctx_read" on public.derivatives_context_snapshots for select using (true);
create policy "deriv_ctx_service_all" on public.derivatives_context_snapshots for all using (true) with check (true);

-- -------------------------
-- Execution cost snapshots
-- -------------------------
create table if not exists public.execution_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid null,
  trade_id uuid null,
  symbol text not null references public.atlas_assets(symbol) on delete cascade,
  snapshot_time timestamptz not null,
  notional_usd numeric not null,
  est_slippage_bps double precision null,
  est_spread_bps double precision null,
  est_total_cost_bps double precision null,
  liquidity_thin boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists exec_cost_symbol_time_idx on public.execution_cost_snapshots(symbol, snapshot_time desc);
create index if not exists exec_cost_trade_idx on public.execution_cost_snapshots(trade_id);

alter table public.execution_cost_snapshots enable row level security;

create policy "exec_cost_read" on public.execution_cost_snapshots for select using (true);
create policy "exec_cost_service_all" on public.execution_cost_snapshots for all using (true) with check (true);

-- -------------------------
-- Scenario reputation (composite PK requires NOT NULL)
-- -------------------------
create table if not exists public.scenario_reputation (
  scenario_key text not null,
  symbol text not null default '_global_',
  timeframe text not null default '_all_',
  regime text not null default '_all_',
  alpha double precision not null default 1,
  beta  double precision not null default 1,
  posterior_mean double precision not null default 0.5,
  credibility double precision not null default 0.0,
  samples int not null default 0,
  win_rate double precision null,
  avg_pnl_usd double precision null,
  sharpe_like double precision null,
  updated_at timestamptz not null default now(),
  primary key (scenario_key, symbol, timeframe, regime)
);

alter table public.scenario_reputation enable row level security;

create policy "scenario_rep_read" on public.scenario_reputation for select using (true);
create policy "scenario_rep_service_all" on public.scenario_reputation for all using (true) with check (true);

-- -------------------------
-- Diagnostics view (adapted to paper_positions schema)
-- -------------------------
create or replace view public.v_atlas_v3_trade_entry_context as
select
  p.id as trade_id,
  p.symbol,
  p.filled_at as opened_at,
  p.closed_at,
  p.realized_pnl as realized_pnl_usd,
  case when p.realized_pnl > 0 then 1 else 0 end as win,
  mc.spread_bps,
  mc.ob_imbalance,
  mc.depth_concentration,
  mc.vol_regime,
  mc.rv_1h,
  mc.rv_24h,
  mc.session_primary,
  dc.funding_rate,
  dc.open_interest_usd,
  dc.open_interest_change_24h,
  ec.est_total_cost_bps,
  ec.liquidity_thin
from public.paper_positions p
left join lateral (
  select * from public.market_context_snapshots m
  where m.trade_id = p.id
  order by abs(extract(epoch from (m.snapshot_time - p.filled_at))) asc
  limit 1
) mc on true
left join lateral (
  select * from public.derivatives_context_snapshots d
  where d.trade_id = p.id
  order by abs(extract(epoch from (d.snapshot_time - p.filled_at))) asc
  limit 1
) dc on true
left join lateral (
  select * from public.execution_cost_snapshots e
  where e.trade_id = p.id
  order by abs(extract(epoch from (e.snapshot_time - p.filled_at))) asc
  limit 1
) ec on true
where p.closed_at is not null;

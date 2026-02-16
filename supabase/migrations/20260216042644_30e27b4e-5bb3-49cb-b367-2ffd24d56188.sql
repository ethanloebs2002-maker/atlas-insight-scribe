
create table if not exists public.market_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid null,
  trade_id uuid null,
  symbol text not null references public.atlas_assets(symbol) on delete cascade,
  snapshot_time timestamptz not null,
  mid_price numeric null,
  best_bid numeric null,
  best_ask numeric null,
  spread_abs numeric null,
  spread_bps double precision null,
  bid_depth_usd numeric null,
  ask_depth_usd numeric null,
  ob_imbalance double precision null,
  depth_concentration double precision null,
  rv_1h double precision null,
  rv_4h double precision null,
  rv_24h double precision null,
  atr_1h double precision null,
  atr_4h double precision null,
  vol_regime text null,
  iv_proxy double precision null,
  iv_rv_spread double precision null,
  session_primary text not null,
  session_detail text not null,
  session_utc_hour int not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists market_context_symbol_time_idx
  on public.market_context_snapshots (symbol, snapshot_time desc);

create index if not exists market_context_trade_idx
  on public.market_context_snapshots (trade_id);

create index if not exists market_context_decision_idx
  on public.market_context_snapshots (decision_id);

alter table public.market_context_snapshots enable row level security;

drop policy if exists "market_context_read" on public.market_context_snapshots;
create policy "market_context_read"
  on public.market_context_snapshots for select
  to authenticated
  using (true);

-- Service role full access
create policy "market_context_service_all"
  on public.market_context_snapshots for all
  to service_role
  using (true)
  with check (true);

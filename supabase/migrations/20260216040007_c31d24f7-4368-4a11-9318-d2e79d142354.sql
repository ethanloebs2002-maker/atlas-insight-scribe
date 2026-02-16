
create table if not exists public.whale_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid null,
  trade_id uuid null,
  symbol text not null references public.atlas_assets(symbol) on delete cascade,
  snapshot_time timestamptz not null,
  window_1h_count int not null default 0,
  window_6h_count int not null default 0,
  window_24h_count int not null default 0,
  window_1h_severity_sum double precision not null default 0,
  window_6h_severity_sum double precision not null default 0,
  window_24h_severity_sum double precision not null default 0,
  large_trade_24h_count int not null default 0,
  volume_spike_24h_count int not null default 0,
  large_transfer_24h_count int not null default 0,
  exchange_inflow_24h_count int not null default 0,
  exchange_outflow_24h_count int not null default 0,
  last_event_time timestamptz null,
  last_event_type text null,
  last_event_source text null,
  last_event_notional_usd numeric null,
  last_event_severity double precision null,
  flow_bias_24h double precision not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whale_context_symbol_time_idx
  on public.whale_context_snapshots (symbol, snapshot_time desc);

create index if not exists whale_context_trade_idx
  on public.whale_context_snapshots (trade_id);

create index if not exists whale_context_decision_idx
  on public.whale_context_snapshots (decision_id);

alter table public.whale_context_snapshots enable row level security;

drop policy if exists "whale_context_read" on public.whale_context_snapshots;
create policy "whale_context_read"
  on public.whale_context_snapshots for select
  to authenticated
  using (true);

-- Service role full access for edge functions to write snapshots
drop policy if exists "whale_context_service_all" on public.whale_context_snapshots;
create policy "whale_context_service_all"
  on public.whale_context_snapshots for all
  to service_role
  using (true)
  with check (true);

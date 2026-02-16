
-- -------------------------
-- Asset registry
-- -------------------------
create table if not exists public.atlas_assets (
  symbol text primary key,
  name text not null,
  enabled boolean not null default true,
  asset_type text not null,
  chain text not null,
  contract_address text null,
  decimals int null,
  whale_min_usd_exchange numeric not null default 750000,
  whale_min_usd_onchain  numeric not null default 1000000,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_assets_enabled_idx
  on public.atlas_assets (enabled);

-- -------------------------
-- Whale Watch core feed
-- -------------------------
create table if not exists public.whale_signals_v2 (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.atlas_assets(symbol) on delete cascade,
  source text not null,
  chain text null,
  signal_type text not null,
  event_time timestamptz not null,
  observed_price numeric null,
  notional_usd numeric not null,
  severity double precision not null default 0.5,
  from_entity text null,
  to_entity text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whale_signals_v2_time_idx
  on public.whale_signals_v2 (event_time desc);

create index if not exists whale_signals_v2_symbol_time_idx
  on public.whale_signals_v2 (symbol, event_time desc);

create index if not exists whale_signals_v2_source_time_idx
  on public.whale_signals_v2 (source, event_time desc);

-- -------------------------
-- Wallets table
-- -------------------------
create table if not exists public.whale_wallets_v2 (
  id uuid primary key default gen_random_uuid(),
  chain text not null,
  address text not null,
  label text null,
  entity_type text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chain, address)
);

create index if not exists whale_wallets_v2_chain_address_idx
  on public.whale_wallets_v2 (chain, address);

-- -------------------------
-- Positions
-- -------------------------
create table if not exists public.whale_positions_v2 (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.atlas_assets(symbol) on delete cascade,
  chain text null,
  wallet_id uuid null references public.whale_wallets_v2(id) on delete set null,
  direction text not null,
  confidence double precision not null default 0.5,
  opened_at timestamptz not null,
  closed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whale_positions_v2_symbol_open_idx
  on public.whale_positions_v2 (symbol, opened_at desc);

-- -------------------------
-- Engine run logs
-- -------------------------
create table if not exists public.whale_engine_runs (
  id uuid primary key default gen_random_uuid(),
  engine text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'RUNNING',
  signals_emitted int not null default 0,
  error text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists whale_engine_runs_engine_time_idx
  on public.whale_engine_runs (engine, started_at desc);

-- -------------------------
-- RLS
-- -------------------------
alter table public.atlas_assets enable row level security;
alter table public.whale_signals_v2 enable row level security;
alter table public.whale_wallets_v2 enable row level security;
alter table public.whale_positions_v2 enable row level security;
alter table public.whale_engine_runs enable row level security;

-- Read policies for authenticated users
create policy "atlas_assets_read"
  on public.atlas_assets for select
  to authenticated
  using (true);

create policy "atlas_assets_service_all"
  on public.atlas_assets for all
  to service_role
  using (true)
  with check (true);

create policy "whale_signals_v2_read"
  on public.whale_signals_v2 for select
  to authenticated
  using (true);

create policy "whale_signals_v2_service_all"
  on public.whale_signals_v2 for all
  to service_role
  using (true)
  with check (true);

create policy "whale_wallets_v2_read"
  on public.whale_wallets_v2 for select
  to authenticated
  using (true);

create policy "whale_wallets_v2_service_all"
  on public.whale_wallets_v2 for all
  to service_role
  using (true)
  with check (true);

create policy "whale_positions_v2_read"
  on public.whale_positions_v2 for select
  to authenticated
  using (true);

create policy "whale_positions_v2_service_all"
  on public.whale_positions_v2 for all
  to service_role
  using (true)
  with check (true);

create policy "whale_engine_runs_read"
  on public.whale_engine_runs for select
  to authenticated
  using (true);

create policy "whale_engine_runs_service_all"
  on public.whale_engine_runs for all
  to service_role
  using (true)
  with check (true);

-- -------------------------
-- Seed: the six supported assets
-- -------------------------
insert into public.atlas_assets (symbol, name, asset_type, chain, contract_address, decimals, whale_min_usd_exchange, whale_min_usd_onchain, metadata)
values
  ('BTC','Bitcoin','native','bitcoin', null, 8, 1000000, 2000000, '{"exchange_symbol":"BTCUSDT"}'),
  ('ETH','Ethereum','native','ethereum', null, 18, 750000, 1500000, '{"exchange_symbol":"ETHUSDT"}'),
  ('SOL','Solana','native','solana', null, 9, 500000, 1000000, '{"exchange_symbol":"SOLUSDT"}'),
  ('DOGE','Dogecoin','native','bitcoin', null, 8, 350000, 750000, '{"exchange_symbol":"DOGEUSDT"}'),
  ('AVAX','Avalanche','native','avalanche', null, 18, 350000, 750000, '{"exchange_symbol":"AVAXUSDT"}'),
  ('LINK','Chainlink','erc20','ethereum', null, 18, 350000, 750000, '{"exchange_symbol":"LINKUSDT","erc20":true}')
on conflict (symbol) do update set
  name = excluded.name,
  asset_type = excluded.asset_type,
  chain = excluded.chain,
  contract_address = excluded.contract_address,
  decimals = excluded.decimals,
  whale_min_usd_exchange = excluded.whale_min_usd_exchange,
  whale_min_usd_onchain = excluded.whale_min_usd_onchain,
  metadata = excluded.metadata,
  updated_at = now();

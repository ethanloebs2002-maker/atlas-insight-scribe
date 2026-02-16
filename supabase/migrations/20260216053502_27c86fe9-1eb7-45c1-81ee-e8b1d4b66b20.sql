
create table if not exists public.trade_scenario_attribution (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.paper_positions(id) on delete cascade,
  decision_id uuid null references public.paper_decisions(id) on delete set null,
  symbol text not null,
  timeframe text null,
  scenario_key text not null,
  contributed_direction text null check (contributed_direction in ('LONG','SHORT','NEUTRAL')),
  contributed_confidence double precision null,
  regime text null,
  session_primary text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tsa_position_idx on public.trade_scenario_attribution(position_id);
create index if not exists tsa_decision_idx on public.trade_scenario_attribution(decision_id);
create index if not exists tsa_scenario_idx on public.trade_scenario_attribution(scenario_key);

alter table public.trade_scenario_attribution enable row level security;

drop policy if exists "tsa_read" on public.trade_scenario_attribution;
create policy "tsa_read"
  on public.trade_scenario_attribution for select
  to authenticated
  using (true);

drop policy if exists "tsa_service_all" on public.trade_scenario_attribution;
create policy "tsa_service_all"
  on public.trade_scenario_attribution for all
  to service_role
  using (true)
  with check (true);

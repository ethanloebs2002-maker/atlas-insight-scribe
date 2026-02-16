
alter table public.market_context_snapshots add column if not exists position_id uuid null references public.paper_positions(id) on delete cascade;

alter table public.derivatives_context_snapshots add column if not exists position_id uuid null references public.paper_positions(id) on delete cascade;

alter table public.execution_cost_snapshots add column if not exists position_id uuid null references public.paper_positions(id) on delete cascade;

create index if not exists mcs_position_idx on public.market_context_snapshots(position_id);

create index if not exists dcs_position_idx on public.derivatives_context_snapshots(position_id);

create index if not exists ecs_position_idx on public.execution_cost_snapshots(position_id);

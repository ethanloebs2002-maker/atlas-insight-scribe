
-- ======================================================
-- ATLAS v3.0.1: Closed-Loop Execution + Paper Wallet (Phase 1)
-- ======================================================

-- ---------- 1) Order expiries on pending entries ----------
alter table public.paper_positions
  add column if not exists expires_at timestamptz null,
  add column if not exists expired_at timestamptz null,
  add column if not exists expiry_reason text null;

create index if not exists paper_positions_pending_expires_idx
  on public.paper_positions(status, expires_at)
  where status = 'PENDING_ENTRY';

-- ---------- 2) Ensure unique attribution per position/scenario ----------
create unique index if not exists tsa_unique_position_scenario
on public.trade_scenario_attribution(position_id, scenario_key);

-- ---------- 3) Paper wallet + ledger (Phase 1 accounting only) ----------
create table if not exists public.paper_wallets (
  id uuid primary key default gen_random_uuid(),
  currency text not null default 'USDT',
  balance numeric not null default 0,
  auto_topup_enabled boolean not null default false,
  auto_topup_threshold numeric not null default 1000,
  auto_topup_amount numeric not null default 5000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paper_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.paper_wallets(id) on delete cascade,
  event_type text not null check (event_type in ('DEPOSIT','WITHDRAWAL','TRADE_PNL','ADJUSTMENT')),
  amount numeric not null,
  position_id uuid null references public.paper_positions(id) on delete set null,
  asset_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pwl_wallet_time_idx on public.paper_wallet_ledger(wallet_id, created_at desc);
create index if not exists pwl_position_idx on public.paper_wallet_ledger(position_id);

insert into public.paper_wallets (currency, balance)
select 'USDT', 100000
where not exists (select 1 from public.paper_wallets);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = 'public' as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_paper_wallets_touch on public.paper_wallets;
create trigger trg_paper_wallets_touch
before update on public.paper_wallets
for each row execute function public.touch_updated_at();

create or replace function public.apply_wallet_ledger()
returns trigger language plpgsql security definer set search_path = 'public' as $$
begin
  update public.paper_wallets set balance = balance + new.amount, updated_at = now()
  where id = new.wallet_id;
  return new;
end; $$;

drop trigger if exists trg_apply_wallet_ledger on public.paper_wallet_ledger;
create trigger trg_apply_wallet_ledger
after insert on public.paper_wallet_ledger
for each row execute function public.apply_wallet_ledger();

-- Credits realized PnL automatically on close (idempotent)
create or replace function public.credit_wallet_on_position_close()
returns trigger language plpgsql security definer set search_path = 'public' as $$
declare w_id uuid; pnl numeric;
begin
  if (old.closed_at is null and new.closed_at is not null) then
    pnl := coalesce(new.realized_pnl, null);
    if pnl is null then return new; end if;

    select id into w_id from public.paper_wallets order by created_at asc limit 1;

    if exists (select 1 from public.paper_wallet_ledger where event_type='TRADE_PNL' and position_id=new.id) then
      return new;
    end if;

    insert into public.paper_wallet_ledger(wallet_id,event_type,amount,position_id,asset_id,metadata)
    values (
      w_id,'TRADE_PNL',pnl,new.id,new.symbol,
      jsonb_build_object('side',new.side,'closed_at',new.closed_at)
    );

    -- optional auto-topup
    if exists (
      select 1 from public.paper_wallets
      where id=w_id and auto_topup_enabled=true and balance < auto_topup_threshold
    ) then
      insert into public.paper_wallet_ledger(wallet_id,event_type,amount,metadata)
      select w_id,'DEPOSIT',auto_topup_amount,
        jsonb_build_object('reason','AUTO_TOPUP','threshold',auto_topup_threshold,'amount',auto_topup_amount)
      from public.paper_wallets where id=w_id;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_credit_wallet_on_close on public.paper_positions;
create trigger trg_credit_wallet_on_close
after update of closed_at, realized_pnl on public.paper_positions
for each row execute function public.credit_wallet_on_position_close();

-- ---------- 4) Learning proof: ledger of terminal outcomes ----------
create table if not exists public.learning_ledger (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.paper_positions(id) on delete cascade,
  decision_id uuid null references public.paper_decisions(id) on delete set null,
  asset_id text not null,
  outcome_type text not null check (outcome_type in ('CLOSED_TP','CLOSED_SL','CLOSED_TIME','EXPIRED_NO_FILL','CANCELED')),
  realized_pnl numeric null,
  scenario_keys text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists learning_ledger_unique_position
on public.learning_ledger(position_id);

create index if not exists learning_ledger_time_idx
on public.learning_ledger(created_at desc);

-- RLS
alter table public.paper_wallets enable row level security;
alter table public.paper_wallet_ledger enable row level security;
alter table public.learning_ledger enable row level security;

drop policy if exists "wallets_read" on public.paper_wallets;
create policy "wallets_read" on public.paper_wallets for select to authenticated using (true);

drop policy if exists "wallets_service_all" on public.paper_wallets;
create policy "wallets_service_all" on public.paper_wallets for all to service_role using (true) with check (true);

drop policy if exists "ledger_read" on public.paper_wallet_ledger;
create policy "ledger_read" on public.paper_wallet_ledger for select to authenticated using (true);

drop policy if exists "ledger_service_all" on public.paper_wallet_ledger;
create policy "ledger_service_all" on public.paper_wallet_ledger for all to service_role using (true) with check (true);

drop policy if exists "learning_read" on public.learning_ledger;
create policy "learning_read" on public.learning_ledger for select to authenticated using (true);

drop policy if exists "learning_service_all" on public.learning_ledger;
create policy "learning_service_all" on public.learning_ledger for all to service_role using (true) with check (true);


create table if not exists public.atlas_brain_cursor (
  id int primary key default 1,
  last_ts timestamptz not null default '1970-01-01T00:00:00Z'
);

-- Ensure single row exists
insert into public.atlas_brain_cursor (id, last_ts)
values (1, '1970-01-01T00:00:00Z')
on conflict (id) do nothing;

-- No RLS needed: only service-role (brain-update admin client) accesses this table


alter table public.atlas_brain_cursor
add column if not exists locked_until timestamptz,
add column if not exists lock_owner text;

update public.atlas_brain_cursor
set locked_until = null,
    lock_owner = null
where id = 1;

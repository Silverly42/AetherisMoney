-- Safe incremental migration for the per-player balance privacy feature.
-- Run this whole file in the Supabase SQL editor as the project owner.

alter table public.profiles
  add column if not exists balance_hidden boolean not null default false;

create or replace function public.get_player_profiles()
returns table(
  id uuid,
  name text,
  balance numeric,
  is_admin boolean,
  balance_hidden boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    case
      when not p.balance_hidden or p.id = auth.uid() then p.balance
      else null
    end,
    p.is_admin,
    p.balance_hidden,
    p.created_at
  from public.profiles p
  where auth.uid() is not null
  order by p.name
$$;

create or replace function public.set_balance_visibility(hide_balance boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in';
  end if;

  update public.profiles
  set balance_hidden = coalesce(hide_balance, false)
  where id = auth.uid();

  if not found then
    raise exception 'Player profile is not ready';
  end if;
end
$$;

grant usage on schema public to authenticated;
revoke all on function public.get_player_profiles() from public;
revoke all on function public.set_balance_visibility(boolean) from public;
grant execute on function public.get_player_profiles() to authenticated;
grant execute on function public.set_balance_visibility(boolean) to authenticated;

-- Prevent clients from bypassing the masked RPC and reading every balance.
revoke select on public.profiles from authenticated;

-- Aetheris Money: paste this entire file into Supabase SQL Editor and click Run.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text unique not null check (name in ('Lucca','Conor','Rhys')),
  balance bigint not null default 1000 check (balance >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  from_id uuid references public.profiles(id),
  to_id uuid not null references public.profiles(id),
  amount bigint not null check (amount > 0 and amount <= 1000000),
  note text not null default '' check (length(note) <= 80),
  kind text not null default 'transfer' check (kind in ('transfer','grant')),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_requests (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles(id),
  payer_id uuid not null references public.profiles(id),
  amount bigint not null check (amount > 0 and amount <= 1000000),
  note text not null default '' check (length(note) <= 80),
  status text not null default 'pending' check (status in ('pending','paid','declined')),
  created_at timestamptz not null default now(),
  check (requester_id <> payer_id)
);

create or replace function public.new_player() returns trigger language plpgsql security definer set search_path = public as $$
declare player_name text;
begin
  player_name := initcap(split_part(new.email, '@', 1));
  if player_name not in ('Lucca','Conor','Rhys') then raise exception 'Unknown player account'; end if;
  insert into public.profiles(id,name,is_admin) values(new.id,player_name,player_name='Rhys') on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.new_player();

-- Backfill users if they were created before this script ran.
insert into public.profiles(id,name,is_admin)
select id, initcap(split_part(email,'@',1)), initcap(split_part(email,'@',1))='Rhys'
from auth.users where lower(split_part(email,'@',1)) in ('lucca','conor','rhys') on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.payment_requests enable row level security;
drop policy if exists "players see profiles" on public.profiles;
create policy "players see profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "players see own transactions" on public.transactions;
create policy "players see own transactions" on public.transactions for select to authenticated using (auth.uid()=from_id or auth.uid()=to_id);
drop policy if exists "players see own requests" on public.payment_requests;
create policy "players see own requests" on public.payment_requests for select to authenticated using (auth.uid()=requester_id or auth.uid()=payer_id);
grant select on public.profiles to authenticated;
grant select on public.transactions to authenticated;
grant select on public.payment_requests to authenticated;

create or replace function public.send_money(recipient uuid, coins bigint, memo text default '') returns void language plpgsql security definer set search_path=public as $$
declare sender_balance bigint;
begin
  if auth.uid() is null or recipient=auth.uid() or coins<1 or coins>1000000 then raise exception 'Invalid transfer'; end if;
  select balance into sender_balance from profiles where id=auth.uid() for update;
  if sender_balance < coins then raise exception 'Not enough money'; end if;
  update profiles set balance=balance-coins where id=auth.uid();
  update profiles set balance=balance+coins where id=recipient;
  if not found then raise exception 'Player not found'; end if;
  insert into transactions(from_id,to_id,amount,note) values(auth.uid(),recipient,coins,left(coalesce(memo,''),80));
end $$;

create or replace function public.request_money(payer uuid, coins bigint, memo text default '') returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or payer=auth.uid() or coins<1 or coins>1000000 then raise exception 'Invalid request'; end if;
  insert into payment_requests(requester_id,payer_id,amount,note) values(auth.uid(),payer,coins,left(coalesce(memo,''),80));
end $$;

create or replace function public.respond_request(request_id bigint, accept_request boolean) returns void language plpgsql security definer set search_path=public as $$
declare req payment_requests; payer_balance bigint;
begin
  select * into req from payment_requests where id=request_id and payer_id=auth.uid() and status='pending' for update;
  if not found then raise exception 'Request not found'; end if;
  if accept_request then
    select balance into payer_balance from profiles where id=auth.uid() for update;
    if payer_balance<req.amount then raise exception 'Not enough money'; end if;
    update profiles set balance=balance-req.amount where id=auth.uid();
    update profiles set balance=balance+req.amount where id=req.requester_id;
    insert into transactions(from_id,to_id,amount,note) values(auth.uid(),req.requester_id,req.amount,req.note);
    update payment_requests set status='paid' where id=request_id;
  else update payment_requests set status='declined' where id=request_id;
  end if;
end $$;

create or replace function public.admin_give(recipient uuid, coins bigint) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from profiles where id=auth.uid() and is_admin) then raise exception 'Admin only'; end if;
  if coins<1 or coins>1000000 then raise exception 'Invalid amount'; end if;
  update profiles set balance=balance+coins where id=recipient;
  if not found then raise exception 'Player not found'; end if;
  insert into transactions(from_id,to_id,amount,note,kind) values(null,recipient,coins,'Treasury grant','grant');
end $$;

create or replace function public.admin_adjust(recipient uuid, coins bigint) returns void language plpgsql security definer set search_path=public as $$
declare current_balance bigint;
begin
  if not exists(select 1 from profiles where id=auth.uid() and is_admin) then raise exception 'Admin only'; end if;
  if coins=0 or coins < -1000000 or coins > 1000000 then raise exception 'Invalid amount'; end if;
  select balance into current_balance from profiles where id=recipient for update;
  if not found then raise exception 'Player not found'; end if;
  if current_balance + coins < 0 then raise exception 'Cannot remove more than the player has'; end if;
  update profiles set balance=balance+coins where id=recipient;
  if coins > 0 then
    insert into transactions(from_id,to_id,amount,note,kind) values(null,recipient,coins,'Admin added money','grant');
  else
    insert into transactions(from_id,to_id,amount,note,kind) values(recipient,recipient,abs(coins),'Admin removed money','grant');
  end if;
end $$;

revoke all on function public.send_money(uuid,bigint,text) from public;
revoke all on function public.request_money(uuid,bigint,text) from public;
revoke all on function public.respond_request(bigint,boolean) from public;
revoke all on function public.admin_give(uuid,bigint) from public;
revoke all on function public.admin_adjust(uuid,bigint) from public;
grant execute on function public.send_money(uuid,bigint,text) to authenticated;
grant execute on function public.request_money(uuid,bigint,text) to authenticated;
grant execute on function public.respond_request(bigint,boolean) to authenticated;
grant execute on function public.admin_give(uuid,bigint) to authenticated;
grant execute on function public.admin_adjust(uuid,bigint) to authenticated;

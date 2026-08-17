-- Aetheris Money: paste this entire file into Supabase SQL Editor and click Run.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text unique not null check (name in ('Lucca','Conor','Rhys','Aleesha','Tiernan','Daniel')),
  balance bigint not null default 1000 check (balance >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Upgrade an existing installation to accept every current player.
alter table public.profiles drop constraint if exists profiles_name_check;
alter table public.profiles add constraint profiles_name_check
  check (name in ('Lucca','Conor','Rhys','Aleesha','Tiernan','Daniel'));

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
  -- Never block Supabase Authentication from creating a user. Only the six
  -- approved game accounts receive a money profile.
  if player_name is null or player_name not in ('Lucca','Conor','Rhys','Aleesha','Tiernan','Daniel') then
    return new;
  end if;
  insert into public.profiles(id,name,is_admin) values(new.id,player_name,player_name='Rhys') on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.new_player();

-- Backfill users if they were created before this script ran.
insert into public.profiles(id,name,is_admin)
select id, initcap(split_part(email,'@',1)), initcap(split_part(email,'@',1))='Rhys'
from auth.users where lower(split_part(email,'@',1)) in ('lucca','conor','rhys','aleesha','tiernan','daniel')
on conflict (id) do update set
  name=excluded.name,
  is_admin=excluded.is_admin;

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
  insert into transactions(from_id,to_id,amount,note,kind) values(null,recipient,coins,'Bank grant','grant');
end $$;

-- Remove the old two-argument version when upgrading an existing installation.
drop function if exists public.admin_adjust(uuid,bigint);
create or replace function public.admin_adjust(recipient uuid, coins bigint, memo text default '') returns void language plpgsql security definer set search_path=public as $$
declare current_balance bigint; adjustment_note text;
begin
  if not exists(select 1 from profiles where id=auth.uid() and is_admin) then raise exception 'Admin only'; end if;
  if coins=0 or coins < -1000000 or coins > 1000000 then raise exception 'Invalid amount'; end if;
  select balance into current_balance from profiles where id=recipient for update;
  if not found then raise exception 'Player not found'; end if;
  if current_balance + coins < 0 then raise exception 'Cannot remove more than the player has'; end if;
  update profiles set balance=balance+coins where id=recipient;
  if coins > 0 then
    adjustment_note := 'Admin added money' || case when btrim(coalesce(memo,''))='' then '' else ' — ' || btrim(memo) end;
    insert into transactions(from_id,to_id,amount,note,kind) values(null,recipient,coins,left(adjustment_note,80),'grant');
  else
    adjustment_note := 'Admin removed money' || case when btrim(coalesce(memo,''))='' then '' else ' — ' || btrim(memo) end;
    insert into transactions(from_id,to_id,amount,note,kind) values(recipient,recipient,abs(coins),left(adjustment_note,80),'grant');
  end if;
end $$;

revoke all on function public.send_money(uuid,bigint,text) from public;
revoke all on function public.request_money(uuid,bigint,text) from public;
revoke all on function public.respond_request(bigint,boolean) from public;
revoke all on function public.admin_give(uuid,bigint) from public;
revoke all on function public.admin_adjust(uuid,bigint,text) from public;
grant execute on function public.send_money(uuid,bigint,text) to authenticated;
grant execute on function public.request_money(uuid,bigint,text) to authenticated;
grant execute on function public.respond_request(bigint,boolean) to authenticated;
grant execute on function public.admin_give(uuid,bigint) to authenticated;
grant execute on function public.admin_adjust(uuid,bigint,text) to authenticated;

-- Player marketplace -------------------------------------------------------
do $$ begin
  alter table public.transactions drop constraint if exists transactions_kind_check;
  alter table public.transactions add constraint transactions_kind_check check (kind in ('transfer','grant','marketplace'));
exception when duplicate_object then null; end $$;

create table if not exists public.shops (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 45),
  created_at timestamptz not null default now()
);

create table if not exists public.shop_products (
  id bigint generated always as identity primary key,
  shop_id bigint not null references public.shops(id) on delete cascade,
  item_name text not null check (length(btrim(item_name)) between 1 and 60),
  price bigint not null check (price between 1 and 1000000),
  stock bigint not null check (stock between 0 and 1000000),
  created_at timestamptz not null default now()
);

create table if not exists public.preorders (
  id bigint generated always as identity primary key,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id bigint not null references public.shop_products(id) on delete cascade,
  quantity bigint not null check (quantity between 1 and 1000000),
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);

create table if not exists public.shop_notifications (
  id bigint generated always as identity primary key,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  shop_id bigint not null references public.shops(id) on delete cascade,
  item_name text not null,
  quantity bigint not null,
  total bigint not null default 0,
  event_kind text not null check (event_kind in ('purchase','preorder')),
  created_at timestamptz not null default now()
);

alter table public.shops enable row level security;
alter table public.shop_products enable row level security;
alter table public.preorders enable row level security;
alter table public.shop_notifications enable row level security;
drop policy if exists "players see shops" on public.shops;
create policy "players see shops" on public.shops for select to authenticated using (true);
drop policy if exists "players see products" on public.shop_products;
create policy "players see products" on public.shop_products for select to authenticated using (true);
drop policy if exists "players see own preorders" on public.preorders;
create policy "players see own preorders" on public.preorders for select to authenticated using (auth.uid() in (buyer_id,seller_id));
drop policy if exists "players see own shop notifications" on public.shop_notifications;
create policy "players see own shop notifications" on public.shop_notifications for select to authenticated using (auth.uid() in (buyer_id,seller_id));
grant select on public.shops,public.shop_products,public.preorders,public.shop_notifications to authenticated;

create or replace function public.create_shop(shop_name text) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  if length(btrim(coalesce(shop_name,''))) not between 2 and 45 then raise exception 'Shop name must be 2–45 characters'; end if;
  if (select count(*) from shops where owner_id=auth.uid() and created_at >= now()-interval '7 days') >= 3 then
    raise exception 'You have already created three shops in the last 7 days';
  end if;
  insert into shops(owner_id,name) values(auth.uid(),btrim(shop_name));
end $$;

create or replace function public.add_shop_product(target_shop bigint, product_name text, unit_price bigint, quantity bigint) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from shops where id=target_shop and owner_id=auth.uid()) then raise exception 'That is not your shop'; end if;
  if length(btrim(coalesce(product_name,''))) not between 1 and 60 or unit_price not between 1 and 1000000 or quantity not between 1 and 1000000 then raise exception 'Invalid product'; end if;
  insert into shop_products(shop_id,item_name,price,stock) values(target_shop,btrim(product_name),unit_price,quantity);
end $$;

create or replace function public.buy_shop_product(target_product bigint, quantity bigint default 1) returns void language plpgsql security definer set search_path=public as $$
declare product shop_products; shop shops; buyer_balance bigint; total_cost bigint;
begin
  if auth.uid() is null or quantity not between 1 and 1000000 then raise exception 'Invalid purchase'; end if;
  select * into product from shop_products where id=target_product for update;
  if not found or product.stock < quantity then raise exception 'Not enough stock'; end if;
  select * into shop from shops where id=product.shop_id;
  if shop.owner_id=auth.uid() then raise exception 'You cannot buy from your own shop'; end if;
  total_cost := product.price*quantity;
  if total_cost>1000000 then raise exception 'Purchase is too large'; end if;
  select balance into buyer_balance from profiles where id=auth.uid() for update;
  if buyer_balance<total_cost then raise exception 'Not enough money'; end if;
  update profiles set balance=balance-total_cost where id=auth.uid();
  update profiles set balance=balance+total_cost where id=shop.owner_id;
  update shop_products set stock=stock-quantity where id=product.id;
  insert into transactions(from_id,to_id,amount,note,kind) values(auth.uid(),shop.owner_id,total_cost,left('Bought '||quantity||' × '||product.item_name||' from '||shop.name,80),'marketplace');
  insert into shop_notifications(buyer_id,seller_id,shop_id,item_name,quantity,total,event_kind) values(auth.uid(),shop.owner_id,shop.id,product.item_name,quantity,total_cost,'purchase');
end $$;

create or replace function public.create_preorder(target_product bigint, quantity bigint default 1) returns void language plpgsql security definer set search_path=public as $$
declare product shop_products; shop shops;
begin
  if auth.uid() is null or quantity not between 1 and 1000000 then raise exception 'Invalid preorder'; end if;
  select * into product from shop_products where id=target_product;
  if not found then raise exception 'Product not found'; end if;
  select * into shop from shops where id=product.shop_id;
  if shop.owner_id=auth.uid() then raise exception 'You cannot preorder from your own shop'; end if;
  insert into preorders(buyer_id,seller_id,product_id,quantity) values(auth.uid(),shop.owner_id,product.id,quantity);
  insert into shop_notifications(buyer_id,seller_id,shop_id,item_name,quantity,total,event_kind) values(auth.uid(),shop.owner_id,shop.id,product.item_name,quantity,product.price*quantity,'preorder');
end $$;

create or replace function public.get_all_activity() returns table(id bigint,from_name text,to_name text,amount bigint,kind text,created_at timestamptz) language sql stable security definer set search_path=public as $$
  select t.id,coalesce(f.name,'Bank'),coalesce(dest.name,'Bank'),t.amount,t.kind,t.created_at
  from transactions t left join profiles f on f.id=t.from_id left join profiles dest on dest.id=t.to_id
  where auth.uid() is not null order by t.created_at desc limit 100
$$;

revoke all on function public.create_shop(text) from public;
revoke all on function public.add_shop_product(bigint,text,bigint,bigint) from public;
revoke all on function public.buy_shop_product(bigint,bigint) from public;
revoke all on function public.create_preorder(bigint,bigint) from public;
revoke all on function public.get_all_activity() from public;
grant execute on function public.create_shop(text),public.add_shop_product(bigint,text,bigint,bigint),public.buy_shop_product(bigint,bigint),public.create_preorder(bigint,bigint),public.get_all_activity() to authenticated;

-- Secure two-player trades -------------------------------------------------
do $$ begin
  alter table public.transactions drop constraint if exists transactions_kind_check;
  alter table public.transactions add constraint transactions_kind_check check (kind in ('transfer','grant','marketplace','trade'));
exception when duplicate_object then null; end $$;

create table if not exists public.trades (
  id bigint generated always as identity primary key,
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  initiator_items jsonb not null default '[]'::jsonb,
  partner_items jsonb not null default '[]'::jsonb,
  initiator_money bigint not null default 0 check (initiator_money between 0 and 1000000),
  partner_money bigint not null default 0 check (partner_money between 0 and 1000000),
  status text not null default 'pending' check (status in ('pending','completed','declined','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (initiator_id <> partner_id)
);

alter table public.trades enable row level security;
drop policy if exists "players see own trades" on public.trades;
create policy "players see own trades" on public.trades for select to authenticated using (auth.uid() in (initiator_id,partner_id));
grant select on public.trades to authenticated;

create or replace function public.valid_trade_items(items jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(items)='array'
    and jsonb_array_length(items) <= 12
    and not exists (
      select 1 from jsonb_array_elements(items) entry
      where jsonb_typeof(entry) <> 'object'
        or length(btrim(coalesce(entry->>'item',''))) not between 1 and 60
        or coalesce((entry->>'quantity') ~ '^[1-9][0-9]{0,6}$',false)=false
        or lower(entry->>'item') ~ '(^air$|^barrier$|^bedrock$|command block|debug stick|jigsaw|structure (block|void)|end (portal|gateway)|budding amethyst|reinforced deepslate|spawner|spawn egg|^vault$|^light$|knowledge book|test (block|instance block)|player head|^infested |suspicious (sand|gravel)|chorus plant|dirt path|frogspawn)'
    )
$$;

-- Upgrade the shop RPC too, so technical/creative-only items cannot be added
-- by bypassing the browser picker.
create or replace function public.add_shop_product(target_shop bigint, product_name text, unit_price bigint, quantity bigint) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from shops where id=target_shop and owner_id=auth.uid()) then raise exception 'That is not your shop'; end if;
  if length(btrim(coalesce(product_name,''))) not between 1 and 60 or unit_price not between 1 and 1000000 or quantity not between 1 and 1000000 then raise exception 'Invalid product'; end if;
  if lower(product_name) ~ '(^air$|^barrier$|^bedrock$|command block|debug stick|jigsaw|structure (block|void)|end (portal|gateway)|budding amethyst|reinforced deepslate|spawner|spawn egg|^vault$|^light$|knowledge book|test (block|instance block)|player head|^infested |suspicious (sand|gravel)|chorus plant|dirt path|frogspawn)' then raise exception 'That item is not obtainable in survival'; end if;
  insert into shop_products(shop_id,item_name,price,stock) values(target_shop,btrim(product_name),unit_price,quantity);
end $$;

create or replace function public.create_trade(partner uuid, my_items jsonb, requested_items jsonb, my_money bigint default 0, requested_money bigint default 0) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or partner=auth.uid() or not exists(select 1 from profiles where id=partner) then raise exception 'Invalid trade partner'; end if;
  if my_money not between 0 and 1000000 or requested_money not between 0 and 1000000 then raise exception 'Invalid money amount'; end if;
  if not valid_trade_items(my_items) or not valid_trade_items(requested_items) then raise exception 'Trade contains an invalid or unavailable item'; end if;
  if jsonb_array_length(my_items)=0 and jsonb_array_length(requested_items)=0 and my_money=0 and requested_money=0 then raise exception 'Trade cannot be empty'; end if;
  insert into trades(initiator_id,partner_id,initiator_items,partner_items,initiator_money,partner_money)
  values(auth.uid(),partner,my_items,requested_items,my_money,requested_money);
end $$;

create or replace function public.respond_trade(trade_id bigint, accept_trade boolean) returns void language plpgsql security definer set search_path=public as $$
declare offer trades; initiator_balance bigint; partner_balance bigint;
begin
  select * into offer from trades where id=trade_id and partner_id=auth.uid() and status='pending' for update;
  if not found then raise exception 'Trade offer not found'; end if;
  if not accept_trade then update trades set status='declined',completed_at=now() where id=trade_id; return; end if;
  perform 1 from profiles where id in (offer.initiator_id,offer.partner_id) order by id for update;
  select balance into initiator_balance from profiles where id=offer.initiator_id;
  select balance into partner_balance from profiles where id=offer.partner_id;
  if initiator_balance < offer.initiator_money or partner_balance < offer.partner_money then raise exception 'A player does not have enough money'; end if;
  update profiles set balance=balance-offer.initiator_money+offer.partner_money where id=offer.initiator_id;
  update profiles set balance=balance-offer.partner_money+offer.initiator_money where id=offer.partner_id;
  if offer.initiator_money>0 then insert into transactions(from_id,to_id,amount,note,kind) values(offer.initiator_id,offer.partner_id,offer.initiator_money,'Player trade','trade'); end if;
  if offer.partner_money>0 then insert into transactions(from_id,to_id,amount,note,kind) values(offer.partner_id,offer.initiator_id,offer.partner_money,'Player trade','trade'); end if;
  update trades set status='completed',completed_at=now() where id=trade_id;
end $$;

create or replace function public.cancel_trade(trade_id bigint) returns void language plpgsql security definer set search_path=public as $$
begin
  update trades set status='cancelled',completed_at=now() where id=trade_id and initiator_id=auth.uid() and status='pending';
  if not found then raise exception 'Trade offer not found'; end if;
end $$;

revoke all on function public.create_trade(uuid,jsonb,jsonb,bigint,bigint) from public;
revoke all on function public.respond_trade(bigint,boolean) from public;
revoke all on function public.cancel_trade(bigint) from public;
grant execute on function public.create_trade(uuid,jsonb,jsonb,bigint,bigint),public.respond_trade(bigint,boolean),public.cancel_trade(bigint) to authenticated;

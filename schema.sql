-- FrikChange production schema
create extension if not exists pgcrypto;
do $$ begin create type public.listing_type as enum ('OFFRE','BESOIN','VOYAGEUR_GP'); exception when duplicate_object then null; end $$;
do $$ begin create type public.listing_status as enum ('PENDING','APPROVED','REJECTED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.transaction_status as enum ('PENDING','SUCCESS','FAILED','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.commission_status as enum ('PENDING','AVAILABLE','WITHDRAWN'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text, phone_whatsapp text,
 referral_code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
 referred_by uuid references public.profiles(id) on delete set null,
 is_ambassador boolean not null default true,
 role text not null default 'user' check(role in('user','admin')),
 created_at timestamptz not null default now()
);
create table if not exists public.listings(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 type public.listing_type not null, currency text not null, amount_range text not null,
 country text not null, city text not null, neighborhood text,
 country_manual text, city_manual text, neighborhood_manual text,
 whatsapp_number text not null, status public.listing_status not null default 'PENDING',
 created_at timestamptz not null default now()
);
create table if not exists public.pricing_tiers(
 id uuid primary key default gen_random_uuid(), code text unique, min_amount numeric not null default 0, max_amount numeric,
 unlock_price numeric not null check(unlock_price>=0), currency text not null default 'MAD',
 chariow_product_id text, chariow_checkout_url text, active boolean not null default true, sort_order integer not null default 0
);
create table if not exists public.transactions(
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.listings(id) on delete cascade,
 buyer_id uuid not null references public.profiles(id) on delete cascade, amount_paid numeric not null default 0,
 currency text not null default 'MAD', pricing_tier_id uuid references public.pricing_tiers(id) on delete set null,
 status public.transaction_status not null default 'PENDING', chariow_transaction_id text,
 chariow_payload jsonb, created_at timestamptz not null default now(), unlocked_at timestamptz
);
create table if not exists public.commissions(
 id uuid primary key default gen_random_uuid(), ambassador_id uuid not null references public.profiles(id) on delete cascade,
 referred_user_id uuid not null references public.profiles(id) on delete cascade,
 transaction_id uuid not null unique references public.transactions(id) on delete cascade,
 commission_rate numeric not null default 30, commission_amount numeric not null default 0,
 status public.commission_status not null default 'PENDING', created_at timestamptz not null default now()
);
create table if not exists public.promo_banner(id uuid primary key default gen_random_uuid(),title text,message text,active boolean not null default true,ends_at timestamptz,created_at timestamptz not null default now());
create table if not exists public.testimonials(id uuid primary key default gen_random_uuid(),name text not null,role text,content text not null,active boolean not null default true,created_at timestamptz not null default now());

create index if not exists listings_status_created_idx on public.listings(status,created_at desc);
create index if not exists listings_user_idx on public.listings(user_id);
create index if not exists unlock_buyer_idx on public.transactions(buyer_id);
create unique index if not exists unlock_success_unique on public.transactions(listing_id,buyer_id) where status='SUCCESS';

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name,phone_whatsapp) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.raw_user_meta_data->>'phone_whatsapp') on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_commission_on_success() returns trigger language plpgsql security definer set search_path=public as $$
declare referrer uuid;
begin
 if new.status='SUCCESS' and old.status is distinct from 'SUCCESS' then
  select referred_by into referrer from public.profiles where id=new.buyer_id;
  if referrer is not null then
   insert into public.commissions(ambassador_id,referred_user_id,transaction_id,commission_rate,commission_amount,status)
   values(referrer,new.buyer_id,new.id,30,round(new.amount_paid*0.30,2),'AVAILABLE')
   on conflict(transaction_id) do nothing;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists unlock_success_commission on public.transactions;
create trigger unlock_success_commission after update of status on public.transactions for each row execute function public.create_commission_on_success();

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.pricing_tiers enable row level security;
alter table public.transactions enable row level security;
alter table public.commissions enable row level security;
alter table public.promo_banner enable row level security;
alter table public.testimonials enable row level security;

drop policy if exists profiles_own_select on public.profiles;
drop policy if exists profiles_own_update on public.profiles;
drop policy if exists listings_public_approved on public.listings;
drop policy if exists listings_owner_insert on public.listings;
drop policy if exists listings_owner_update on public.listings;
drop policy if exists pricing_public_active on public.pricing_tiers;
drop policy if exists unlock_buyer_select on public.transactions;
drop policy if exists commission_ambassador_select on public.commissions;
drop policy if exists promo_public_active on public.promo_banner;
drop policy if exists testimonials_public_active on public.testimonials;

create policy profiles_own_select on public.profiles for select to authenticated using((select auth.uid())=id);
create policy profiles_own_update on public.profiles for update to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
create policy listings_public_approved on public.listings for select to anon,authenticated using(status='APPROVED');
create policy listings_owner_insert on public.listings for insert to authenticated with check((select auth.uid())=user_id);
create policy listings_owner_update on public.listings for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy pricing_public_active on public.pricing_tiers for select to anon,authenticated using(active=true);
create policy unlock_buyer_select on public.transactions for select to authenticated using((select auth.uid())=buyer_id);
create policy commission_ambassador_select on public.commissions for select to authenticated using((select auth.uid())=ambassador_id);
create policy promo_public_active on public.promo_banner for select to anon,authenticated using(active=true);
create policy testimonials_public_active on public.testimonials for select to anon,authenticated using(active=true);

drop view if exists public.public_listings;
create view public.public_listings with(security_invoker=true) as
select id,user_id,type,currency,amount_range,country,city,neighborhood,country_manual,city_manual,neighborhood_manual,status,created_at
from public.listings where status='APPROVED';

grant select(id,user_id,type,currency,amount_range,country,city,neighborhood,country_manual,city_manual,neighborhood_manual,status,created_at) on public.listings to anon,authenticated;
grant select on public.public_listings,public.pricing_tiers,public.promo_banner,public.testimonials to anon,authenticated;
revoke all on public.listings from anon,authenticated;
grant insert,update on public.listings to authenticated;
revoke all on public.transactions from anon,authenticated;
grant select on public.transactions to authenticated;

insert into public.pricing_tiers(min_amount,max_amount,unlock_price,currency,sort_order)
select 0,2000,20,'MAD',1 where not exists(select 1 from public.pricing_tiers);
insert into public.pricing_tiers(min_amount,max_amount,unlock_price,currency,sort_order)
select 2001,5000,30,'MAD',2 where not exists(select 1 from public.pricing_tiers where min_amount=2001);
insert into public.pricing_tiers(min_amount,max_amount,unlock_price,currency,sort_order)
select 5001,null,50,'MAD',3 where not exists(select 1 from public.pricing_tiers where min_amount=5001);
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.create_commission_on_success() from public,anon,authenticated;


-- Post-MVP hardening / current production state
alter table public.transactions add column if not exists chariow_checkout_url text;

drop policy if exists listings_public_approved on public.listings;
drop policy if exists listings_owner_select on public.listings;
drop policy if exists listings_owner_insert on public.listings;
drop policy if exists listings_owner_update on public.listings;
drop policy if exists listings_owner_delete on public.listings;
create policy listings_select on public.listings for select to anon,authenticated
using(status='APPROVED' or (select auth.uid())=user_id);
create policy listings_owner_insert on public.listings for insert to authenticated
with check((select auth.uid())=user_id and status='PENDING');
create policy listings_owner_update on public.listings for update to authenticated
using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy listings_owner_delete on public.listings for delete to authenticated
using((select auth.uid())=user_id);

create or replace function public.protect_listing_fields()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() = old.user_id then
    new.user_id := old.user_id;
    new.status := old.status;
  end if;
  return new;
end $$;
drop trigger if exists protect_listing_fields_trigger on public.listings;
create trigger protect_listing_fields_trigger before update on public.listings
for each row execute function public.protect_listing_fields();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare referrer uuid;
begin
  select id into referrer from public.profiles
  where referral_code=upper(nullif(trim(new.raw_user_meta_data->>'referral_code'),''))
  limit 1;
  insert into public.profiles(id,full_name,phone_whatsapp,referred_by)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),
         new.raw_user_meta_data->>'phone_whatsapp',
         case when referrer is not null and referrer<>new.id then referrer else null end)
  on conflict(id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

revoke execute on function public.protect_listing_fields() from public,anon,authenticated;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
grant delete on public.listings to authenticated;

-- Current listing enrichment and secure grants
alter table public.listings add column if not exists amount numeric,add column if not exists amount_desired numeric,add column if not exists district text,add column if not exists is_traveler boolean not null default false,add column if not exists flight_date date,add column if not exists destination_city text,add column if not exists notes text;
update public.listings set amount=coalesce(amount,nullif(regexp_replace(split_part(amount_range,'-',1),'[^0-9.]','','g'),'')::numeric) where amount is null;
update public.listings set district=coalesce(district,neighborhood) where district is null;
drop view if exists public.public_listings;
create view public.public_listings with(security_invoker=true) as select id,type,currency,amount_currency,desired_currency,amount,amount_desired,country,city,district,is_traveler,flight_date,destination_city,notes,created_at from public.listings where status='APPROVED';
drop policy if exists listings_select on public.listings;drop policy if exists listings_owner_insert on public.listings;drop policy if exists listings_owner_update on public.listings;drop policy if exists listings_owner_delete on public.listings;
create policy listings_select on public.listings for select to anon,authenticated using(status='APPROVED' or (select auth.uid())=user_id);
create policy listings_owner_insert on public.listings for insert to authenticated with check((select auth.uid())=user_id and status='PENDING');
create policy listings_owner_update on public.listings for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy listings_owner_delete on public.listings for delete to authenticated using((select auth.uid())=user_id);
revoke all on public.listings from anon,authenticated;
grant select(id,type,currency,amount,amount_desired,country,city,district,is_traveler,flight_date,destination_city,notes,created_at) on public.listings to anon,authenticated;
grant insert(type,currency,amount_range,amount,amount_desired,country,city,neighborhood,district,country_manual,city_manual,neighborhood_manual,whatsapp_number,is_traveler,flight_date,destination_city,notes,status,user_id) on public.listings to authenticated;
grant update(type,currency,amount_range,amount,amount_desired,country,city,neighborhood,district,country_manual,city_manual,neighborhood_manual,whatsapp_number,is_traveler,flight_date,destination_city,notes) on public.listings to authenticated;
grant delete on public.listings to authenticated;
grant select on public.public_listings to anon,authenticated;


-- Referral capture/RLS + dual-currency listing model
alter table public.listings
  add column if not exists amount_currency text,
  add column if not exists desired_currency text;

update public.listings
set amount_currency = case
  when upper(currency) in ('MAD','XOF','XAF','CDF','GNF','GHS','EUR','USD') then upper(currency)
  else null
end
where amount_currency is null;

update public.listings
set desired_currency = case
  when upper(currency) in ('MAD','XOF','XAF','CDF','GNF','GHS','EUR','USD') then upper(currency)
  else null
end
where desired_currency is null;

alter table public.listings drop constraint if exists listings_amount_currency_check;
alter table public.listings add constraint listings_amount_currency_check
  check (amount_currency is null or amount_currency in ('MAD','XOF','XAF','CDF','GNF','GHS','EUR','USD'));
alter table public.listings drop constraint if exists listings_desired_currency_check;
alter table public.listings add constraint listings_desired_currency_check
  check (desired_currency is null or desired_currency in ('MAD','XOF','XAF','CDF','GNF','GHS','EUR','USD'));

create index if not exists profiles_referred_by_idx on public.profiles(referred_by);

drop policy if exists profiles_own_select on public.profiles;
drop policy if exists profiles_referrals_select on public.profiles;
drop policy if exists profiles_select_own_or_referrals on public.profiles;
create policy profiles_select_own_or_referrals
on public.profiles for select to authenticated
using ((select auth.uid())=id or (select auth.uid())=referred_by);

revoke all on public.profiles from anon,authenticated;
grant select(id,full_name,phone_whatsapp,referral_code,is_ambassador,created_at,referred_by)
  on public.profiles to authenticated;
grant update(full_name,phone_whatsapp) on public.profiles to authenticated;

drop view if exists public.my_referrals;
create view public.my_referrals with(security_invoker=true) as
select id,created_at
from public.profiles
where referred_by=(select auth.uid());
grant select on public.my_referrals to authenticated;

revoke select on public.listings from anon,authenticated;
grant select(
  id,type,currency,amount_currency,desired_currency,amount,amount_desired,
  country,city,district,is_traveler,flight_date,destination_city,notes,created_at
) on public.listings to anon,authenticated;

revoke insert on public.listings from authenticated;
grant insert(
  type,currency,amount_range,amount,amount_desired,amount_currency,desired_currency,
  country,city,neighborhood,district,country_manual,city_manual,neighborhood_manual,
  whatsapp_number,is_traveler,flight_date,destination_city,notes,status,user_id
) on public.listings to authenticated;

revoke update on public.listings from authenticated;
grant update(
  type,currency,amount_range,amount,amount_desired,amount_currency,desired_currency,
  country,city,neighborhood,district,country_manual,city_manual,neighborhood_manual,
  whatsapp_number,is_traveler,flight_date,destination_city,notes
) on public.listings to authenticated;

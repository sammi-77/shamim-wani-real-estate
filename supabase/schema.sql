-- Shamim Wani Real Estate: baseline database and access policies.
-- Apply this in the Supabase SQL editor before using the connected admin app.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

drop policy if exists "Admins can read their own membership" on public.admin_users;
create policy "Admins can read their own membership"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  area text not null,
  address text not null,
  price bigint not null check (price >= 0),
  property_type text not null,
  beds numeric(3,1) not null default 0,
  baths numeric(3,1) not null default 0,
  sqft integer not null default 0 check (sqft >= 0),
  status text not null default 'active' check (status in ('active','draft','archived')),
  availability text not null default 'available' check (availability in ('available','pending','sold')),
  featured boolean not null default false,
  description text not null default '',
  amenities text[] not null default '{}',
  image_url text not null default '',
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.properties enable row level security;
revoke all on public.properties from anon, authenticated;
grant select on public.properties to anon, authenticated;
grant insert, update, delete on public.properties to authenticated;

drop policy if exists "Public can read active properties" on public.properties;
create policy "Public can read active properties"
  on public.properties for select to anon, authenticated
  using (status = 'active');

drop policy if exists "Admins can read all properties" on public.properties;
create policy "Admins can read all properties"
  on public.properties for select to authenticated
  using ((select private.is_admin()));

drop policy if exists "Admins can create properties" on public.properties;
create policy "Admins can create properties"
  on public.properties for insert to authenticated
  with check ((select private.is_admin()));

drop policy if exists "Admins can update properties" on public.properties;
create policy "Admins can update properties"
  on public.properties for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "Admins can delete properties" on public.properties;
create policy "Admins can delete properties"
  on public.properties for delete to authenticated
  using ((select private.is_admin()));

create index if not exists properties_public_area_price_idx
  on public.properties (area, price) where status = 'active';

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 320),
  message text not null default '' check (char_length(message) <= 5000),
  tour_date date,
  tour_time text check (tour_time is null or tour_time in ('Morning','Afternoon','Evening')),
  property_id uuid references public.properties(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.inquiries enable row level security;
revoke all on public.inquiries from anon, authenticated;
grant insert on public.inquiries to anon, authenticated;
grant select on public.inquiries to authenticated;

drop policy if exists "Visitors can submit inquiries" on public.inquiries;
create policy "Visitors can submit inquiries"
  on public.inquiries for insert to anon, authenticated
  with check (
    char_length(trim(name)) between 1 and 120
    and char_length(trim(email)) between 3 and 320
    and char_length(message) <= 5000
  );

drop policy if exists "Admins can read inquiries" on public.inquiries;
create policy "Admins can read inquiries"
  on public.inquiries for select to authenticated
  using ((select private.is_admin()));

-- Public read is limited to listing images. Only an authorized admin can change files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view property images" on storage.objects;
create policy "Public can view property images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'property-images');

drop policy if exists "Admins can upload property images" on storage.objects;
create policy "Admins can upload property images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'property-images' and (select private.is_admin()));

drop policy if exists "Admins can update property images" on storage.objects;
create policy "Admins can update property images"
  on storage.objects for update to authenticated
  using (bucket_id = 'property-images' and (select private.is_admin()))
  with check (bucket_id = 'property-images' and (select private.is_admin()));

drop policy if exists "Admins can delete property images" on storage.objects;
create policy "Admins can delete property images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'property-images' and (select private.is_admin()));

-- Provision the initial admin only after creating their Auth account:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'SHAMIM_LOGIN_EMAIL';


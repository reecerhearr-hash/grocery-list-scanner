-- Grocery List Scanner — database setup (safe to re-run)
-- Separate logins, shared through a household: every list item and remembered price
-- belongs to a household, and only that household's members can see or change it.

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.grocery_items add column if not exists quantity text;
alter table public.grocery_items add column if not exists category text;
alter table public.grocery_items add column if not exists price numeric(10,2);

-- ---------- Households ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Home',
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create unique index if not exists household_members_one_per_user on public.household_members(user_id);

-- The signed-in user's household (each person belongs to one).
create or replace function public.my_household_id() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.household_members where user_id = auth.uid() limit 1
$$;

-- ---------- Scope items and prices to a household ----------
alter table public.grocery_items add column if not exists household_id uuid
  references public.households(id) on delete cascade;
alter table public.grocery_items alter column household_id set default public.my_household_id();
create index if not exists grocery_items_household on public.grocery_items(household_id);

create table if not exists public.grocery_prices (
  name text not null,             -- lower-cased item name
  price numeric(10,2) not null,
  updated_at timestamptz not null default now()
);
alter table public.grocery_prices add column if not exists household_id uuid
  references public.households(id) on delete cascade;
alter table public.grocery_prices alter column household_id set default public.my_household_id();
delete from public.grocery_prices where household_id is null;   -- old single-user prices can't be assigned
alter table public.grocery_prices alter column household_id set not null;
alter table public.grocery_prices drop constraint if exists grocery_prices_pkey;
alter table public.grocery_prices add primary key (household_id, name);

-- ---------- Row-level security ----------
alter table public.grocery_items enable row level security;
alter table public.grocery_prices enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;

drop policy if exists "Allow all for anon" on public.grocery_items;
drop policy if exists "Allow all for anon" on public.grocery_prices;

drop policy if exists "Household members" on public.grocery_items;
create policy "Household members" on public.grocery_items for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

drop policy if exists "Household members" on public.grocery_prices;
create policy "Household members" on public.grocery_prices for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

drop policy if exists "Members can see their household" on public.households;
create policy "Members can see their household" on public.households for select to authenticated
  using (id = (select public.my_household_id()));
drop policy if exists "Members can rename their household" on public.households;
create policy "Members can rename their household" on public.households for update to authenticated
  using (id = (select public.my_household_id())) with check (id = (select public.my_household_id()));

drop policy if exists "Members can see each other" on public.household_members;
create policy "Members can see each other" on public.household_members for select to authenticated
  using (household_id = (select public.my_household_id()));
-- Creating, joining and leaving go through the functions below.

-- ---------- Household actions ----------
create or replace function public.create_household(p_name text default 'Home')
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if public.my_household_id() is not null then raise exception 'You are already in a household. Leave it first.'; end if;
  insert into public.households(name, created_by) values (coalesce(nullif(trim(p_name), ''), 'Home'), auth.uid()) returning * into h;
  insert into public.household_members(household_id, user_id) values (h.id, auth.uid());
  return h;
end $$;

create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if public.my_household_id() is not null then raise exception 'You are already in a household. Leave it first.'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'No household has that invite code'; end if;
  insert into public.household_members(household_id, user_id) values (h.id, auth.uid());
  return h;
end $$;

-- Leaving removes you; the last person to leave deletes the household and its list.
create or replace function public.leave_household()
returns void language plpgsql security definer set search_path = public as $$
declare hid uuid := public.my_household_id();
begin
  if hid is null then return; end if;
  delete from public.household_members where household_id = hid and user_id = auth.uid();
  if not exists (select 1 from public.household_members where household_id = hid) then
    delete from public.households where id = hid;
  end if;
end $$;

create or replace function public.new_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare hid uuid := public.my_household_id(); c text;
begin
  if hid is null then raise exception 'Not in a household'; end if;
  c := upper(substr(md5(gen_random_uuid()::text), 1, 6));
  update public.households set invite_code = c where id = hid;
  return c;
end $$;

-- Names on the Household screen: emails of the people in your own household only.
create or replace function public.household_member_emails()
returns table(user_id uuid, email text, joined_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, u.email::text, m.joined_at
  from public.household_members m join auth.users u on u.id = m.user_id
  where m.household_id = public.my_household_id()
  order by m.joined_at
$$;

revoke execute on function public.create_household(text), public.join_household(text),
  public.leave_household(), public.new_invite_code(), public.my_household_id(),
  public.household_member_emails() from public, anon;
grant execute on function public.create_household(text), public.join_household(text),
  public.leave_household(), public.new_invite_code(), public.my_household_id(),
  public.household_member_emails() to authenticated;

-- ---------- Realtime: lets checkmarks sync live between phones ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grocery_items') then
    alter publication supabase_realtime add table public.grocery_items;
  end if;
end $$;

-- Grocery List Scanner — database setup (safe to re-run)
create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.grocery_items add column if not exists quantity text;
alter table public.grocery_items add column if not exists category text;
alter table public.grocery_items add column if not exists price numeric(10,2);

create table if not exists public.grocery_prices (
  name text primary key,          -- lower-cased item name
  price numeric(10,2) not null,
  updated_at timestamptz not null default now()
);

alter table public.grocery_items enable row level security;
alter table public.grocery_prices enable row level security;
drop policy if exists "Allow all for anon" on public.grocery_items;
create policy "Allow all for anon" on public.grocery_items for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.grocery_prices;
create policy "Allow all for anon" on public.grocery_prices for all using (true) with check (true);

-- Realtime: lets checkmarks sync live between phones
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grocery_items') then
    alter publication supabase_realtime add table public.grocery_items;
  end if;
end $$;

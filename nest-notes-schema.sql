-- The Nest — shared notes/saves/ticks store.
-- Run ONCE in your Supabase project: Dashboard > SQL Editor > New Query > paste > Run.
-- Safe to re-run (idempotent).

create table if not exists public.nest_kv (
  k          text primary key,
  v          text,
  updated_at timestamptz default now()
);

alter table public.nest_kv enable row level security;

-- Private family site (noindex, two users). The anon/publishable key is public
-- by design, so these policies let it read+write this one table. No other table
-- is exposed. If you ever want real per-user auth, tighten these later.
drop policy if exists "nest anon read"   on public.nest_kv;
drop policy if exists "nest anon insert" on public.nest_kv;
drop policy if exists "nest anon update" on public.nest_kv;
drop policy if exists "nest anon delete" on public.nest_kv;

create policy "nest anon read"   on public.nest_kv for select using (true);
create policy "nest anon insert" on public.nest_kv for insert with check (true);
create policy "nest anon update" on public.nest_kv for update using (true) with check (true);
create policy "nest anon delete" on public.nest_kv for delete using (true);

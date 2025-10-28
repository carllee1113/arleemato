-- Supabase schema for Pomodoro MVP
-- Run this in the Supabase SQL editor for your project.

-- Ensure pgcrypto is available for gen_random_uuid()
create extension if not exists pgcrypto;

-- Core table storing per-session logs
create table if not exists public.pomodoro_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  started_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  is_work boolean not null default true,
  note_count integer not null default 0 check (note_count >= 0),
  created_at timestamptz not null default now()
);

-- Helpful index for per-user queries by date
create index if not exists idx_pomodoro_sessions_user_started
  on public.pomodoro_sessions (user_id, started_at);

-- Enable Row Level Security
alter table public.pomodoro_sessions enable row level security;

-- Policies: users can select/insert/update/delete only their own rows
-- Note: If policies already exist, re-running these will error; 
-- run once or drop policies before re-creating.
drop policy if exists "Select own sessions" on public.pomodoro_sessions;
drop policy if exists "Insert own sessions" on public.pomodoro_sessions;
drop policy if exists "Update own sessions" on public.pomodoro_sessions;
drop policy if exists "Delete own sessions" on public.pomodoro_sessions;
create policy "Select own sessions"
  on public.pomodoro_sessions
  for select
  using (auth.uid() = user_id);

create policy "Insert own sessions"
  on public.pomodoro_sessions
  for insert
  with check (auth.uid() = user_id);

create policy "Update own sessions"
  on public.pomodoro_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own sessions"
  on public.pomodoro_sessions
  for delete
  using (auth.uid() = user_id);

-- Example aggregation query (optional)
-- select date_trunc('day', started_at)::date as day, count(*) as sessions
-- from public.pomodoro_sessions
-- where user_id = auth.uid()
-- group by 1
-- order by 1 desc;
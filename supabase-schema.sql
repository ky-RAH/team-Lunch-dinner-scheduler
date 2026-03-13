create table if not exists public.team_scheduler_state (
  key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.team_scheduler_state enable row level security;

drop policy if exists "public read scheduler state" on public.team_scheduler_state;
create policy "public read scheduler state"
on public.team_scheduler_state
for select
to anon
using (true);

drop policy if exists "public write scheduler state" on public.team_scheduler_state;
create policy "public write scheduler state"
on public.team_scheduler_state
for insert
to anon
with check (true);

drop policy if exists "public update scheduler state" on public.team_scheduler_state;
create policy "public update scheduler state"
on public.team_scheduler_state
for update
to anon
using (true)
with check (true);

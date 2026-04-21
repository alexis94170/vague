-- ============================================================
-- Vague · schéma Supabase
-- À exécuter dans : Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Extensions (gen_random_uuid)
create extension if not exists "pgcrypto";

-- ============== PROJECTS ==============
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects(user_id);
create index if not exists projects_user_order_idx on public.projects(user_id, order_index);

alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- ============== TASKS ==============
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  notes text,
  done boolean not null default false,
  done_at timestamptz,
  priority text not null default 'none',
  tags text[] not null default '{}',
  due_date date,
  due_time time,
  estimate_minutes integer,
  subtasks jsonb not null default '[]'::jsonb,
  recurrence jsonb,
  snoozed_until date,
  waiting boolean not null default false,
  waiting_for text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_idx on public.tasks(user_id);
create index if not exists tasks_user_done_idx on public.tasks(user_id, done);
create index if not exists tasks_user_project_idx on public.tasks(user_id, project_id);
create index if not exists tasks_user_due_idx on public.tasks(user_id, due_date);
create index if not exists tasks_user_waiting_idx on public.tasks(user_id, waiting);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id);

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

-- ============== updated_at trigger ==============
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ============== realtime ==============
-- Active les websockets sur ces tables pour la sync temps réel
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.tasks;

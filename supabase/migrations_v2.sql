-- ============================================================
-- Vague · Migration v2 — soft delete + task templates + AI usage
-- À exécuter dans Supabase SQL Editor (après schema.sql + push_schema.sql)
-- ============================================================

-- === Soft delete for tasks ===
alter table public.tasks
  add column if not exists deleted_at timestamptz;

create index if not exists tasks_user_deleted_idx on public.tasks(user_id, deleted_at);

-- === Task templates ===
create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  color text default '#6366f1',
  items jsonb not null default '[]'::jsonb,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_user_idx on public.task_templates(user_id);

alter table public.task_templates enable row level security;

drop policy if exists "templates_select_own" on public.task_templates;
create policy "templates_select_own" on public.task_templates for select using (auth.uid() = user_id);

drop policy if exists "templates_insert_own" on public.task_templates;
create policy "templates_insert_own" on public.task_templates for insert with check (auth.uid() = user_id);

drop policy if exists "templates_update_own" on public.task_templates;
create policy "templates_update_own" on public.task_templates for update using (auth.uid() = user_id);

drop policy if exists "templates_delete_own" on public.task_templates;
create policy "templates_delete_own" on public.task_templates for delete using (auth.uid() = user_id);

-- trigger updated_at
drop trigger if exists templates_set_updated_at on public.task_templates;
create trigger templates_set_updated_at
  before update on public.task_templates
  for each row execute function public.set_updated_at();

-- === AI usage tracking ===
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(10,6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_date_idx on public.ai_usage(user_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage for select using (auth.uid() = user_id);

drop policy if exists "ai_usage_insert_own" on public.ai_usage;
create policy "ai_usage_insert_own" on public.ai_usage for insert with check (auth.uid() = user_id);

-- === Realtime enablement for new tables ===
alter publication supabase_realtime add table public.task_templates;

-- === Cleanup function: hard-delete tasks soft-deleted > 30 days ago ===
create or replace function public.cleanup_old_deleted_tasks()
returns integer language plpgsql security definer as $$
declare
  n integer;
begin
  delete from public.tasks
  where deleted_at is not null
    and deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

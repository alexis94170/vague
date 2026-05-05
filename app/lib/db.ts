"use client";

import { AppState, Project, Task, Priority, Subtask, Recurrence, TaskTemplate, TaskTemplateItem } from "./types";
import { supabase } from "./supabase";

type DbProject = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  order_index: number;
  created_at: string;
  updated_at: string;
};

type DbTask = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  notes: string | null;
  done: boolean;
  done_at: string | null;
  priority: string;
  tags: string[];
  due_date: string | null;
  due_time: string | null;
  estimate_minutes: number | null;
  subtasks: Subtask[];
  recurrence: Recurrence | null;
  snoozed_until: string | null;
  snooze_count: number | null;
  waiting: boolean;
  waiting_for: string | null;
  deleted_at: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
};

function projectFromDb(r: DbProject): Project {
  return { id: r.id, name: r.name, color: r.color, order: r.order_index };
}

function taskFromDb(r: DbTask): Task {
  return {
    id: r.id,
    projectId: r.project_id ?? undefined,
    title: r.title,
    notes: r.notes ?? undefined,
    done: r.done,
    doneAt: r.done_at ?? undefined,
    priority: (r.priority as Priority) || "none",
    tags: r.tags ?? [],
    dueDate: r.due_date ?? undefined,
    dueTime: r.due_time ?? undefined,
    estimateMinutes: r.estimate_minutes ?? undefined,
    subtasks: r.subtasks ?? [],
    recurrence: r.recurrence ?? undefined,
    snoozedUntil: r.snoozed_until ?? undefined,
    snoozeCount: r.snooze_count ?? undefined,
    waiting: r.waiting ?? false,
    waitingFor: r.waiting_for ?? undefined,
    deletedAt: r.deleted_at ?? undefined,
    order: r.order_index,
    createdAt: r.created_at,
  };
}

function projectToDb(p: Project, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    color: p.color,
    order_index: p.order,
  };
}

function taskToDb(t: Task, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    project_id: t.projectId || null,
    title: t.title,
    notes: t.notes || null,
    done: t.done,
    done_at: t.doneAt || null,
    priority: t.priority,
    tags: t.tags ?? [],
    due_date: t.dueDate || null,
    due_time: t.dueTime || null,
    estimate_minutes: t.estimateMinutes ?? null,
    subtasks: t.subtasks ?? [],
    recurrence: t.recurrence ?? null,
    snoozed_until: t.snoozedUntil || null,
    snooze_count: t.snoozeCount ?? 0,
    waiting: t.waiting ?? false,
    waiting_for: t.waitingFor || null,
    deleted_at: t.deletedAt || null,
    order_index: t.order ?? 0,
  };
}

/* ==================== Templates ==================== */

type DbTemplate = {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string;
  items: TaskTemplateItem[];
  order_index: number;
};

function templateFromDb(r: DbTemplate): TaskTemplate {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon ?? undefined,
    color: r.color,
    items: r.items ?? [],
    order: r.order_index,
  };
}

function templateToDb(t: TaskTemplate, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    name: t.name,
    icon: t.icon || null,
    color: t.color,
    items: t.items,
    order_index: t.order ?? 0,
  };
}

export async function fetchTemplates(userId: string): Promise<TaskTemplate[]> {
  const { data, error } = await supabase()
    .from("task_templates")
    .select("*")
    .eq("user_id", userId)
    .order("order_index");
  if (error) throw error;
  return (data ?? []).map(templateFromDb);
}

export async function upsertTemplateDb(t: TaskTemplate, userId: string) {
  const { error } = await supabase().from("task_templates").upsert(templateToDb(t, userId));
  if (error) throw error;
}

export async function deleteTemplateDb(id: string) {
  const { error } = await supabase().from("task_templates").delete().eq("id", id);
  if (error) throw error;
}

/* ==================== AI usage ==================== */

export async function logAiUsage(userId: string, entry: {
  endpoint: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}) {
  await supabase().from("ai_usage").insert({
    user_id: userId,
    endpoint: entry.endpoint,
    model: entry.model,
    input_tokens: entry.input,
    output_tokens: entry.output,
    cache_read_tokens: entry.cacheRead,
    cache_write_tokens: entry.cacheWrite,
    cost_usd: entry.cost,
  });
}

export async function fetchAiUsageSince(userId: string, sinceISO: string): Promise<{
  total_cost: number;
  by_endpoint: Record<string, { count: number; cost: number }>;
}> {
  const { data, error } = await supabase()
    .from("ai_usage")
    .select("endpoint, cost_usd")
    .eq("user_id", userId)
    .gte("created_at", sinceISO);
  if (error) throw error;
  const by: Record<string, { count: number; cost: number }> = {};
  let total = 0;
  (data ?? []).forEach((row: { endpoint: string; cost_usd: number }) => {
    const c = Number(row.cost_usd);
    total += c;
    by[row.endpoint] ??= { count: 0, cost: 0 };
    by[row.endpoint].count += 1;
    by[row.endpoint].cost += c;
  });
  return { total_cost: total, by_endpoint: by };
}

export async function fetchAll(userId: string): Promise<AppState> {
  const sb = supabase();
  const [{ data: projects, error: pe }, { data: tasks, error: te }] = await Promise.all([
    sb.from("projects").select("*").eq("user_id", userId).order("order_index"),
    sb.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  if (pe) throw pe;
  if (te) throw te;
  return {
    version: 2,
    projects: (projects ?? []).map(projectFromDb),
    tasks: (tasks ?? []).map(taskFromDb),
    settings: { theme: "system" },
  };
}

// Soft-delete: set deleted_at instead of removing
export async function softDeleteTask(id: string) {
  const { error } = await supabase()
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteTasks(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase()
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

export async function restoreTask(id: string) {
  const { error } = await supabase()
    .from("tasks")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreTasks(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase()
    .from("tasks")
    .update({ deleted_at: null })
    .in("id", ids);
  if (error) throw error;
}

export async function upsertProject(p: Project, userId: string) {
  const { error } = await supabase().from("projects").upsert(projectToDb(p, userId));
  if (error) throw error;
}

export async function deleteProjectDb(id: string) {
  const { error } = await supabase().from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertTask(t: Task, userId: string) {
  const { error } = await supabase().from("tasks").upsert(taskToDb(t, userId));
  if (error) throw error;
}

export async function upsertTasks(tasks: Task[], userId: string) {
  if (tasks.length === 0) return;
  const { error } = await supabase()
    .from("tasks")
    .upsert(tasks.map((t) => taskToDb(t, userId)));
  if (error) throw error;
}

export async function deleteTaskDb(id: string) {
  const { error } = await supabase().from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteTasksDb(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase().from("tasks").delete().in("id", ids);
  if (error) throw error;
}

"use client";

import { AppState, Project, Task, Priority, Subtask, Recurrence } from "./types";
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
  waiting: boolean;
  waiting_for: string | null;
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
    waiting: r.waiting ?? false,
    waitingFor: r.waiting_for ?? undefined,
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
    waiting: t.waiting ?? false,
    waiting_for: t.waitingFor || null,
    order_index: t.order ?? 0,
  };
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

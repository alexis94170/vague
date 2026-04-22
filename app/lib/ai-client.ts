"use client";

import { Priority, Project, Task } from "./types";
import { todayISO, diffDays } from "./dates";

export type ClassifyResult = {
  priority: Priority;
  projectId: string | null;
  tags: string[];
  subtasks: string[];
  note?: string;
};

export type PlanResult = {
  selectedIds: string[];
  reasoning: string;
  warnings: string[];
};

export async function aiClassify(title: string, projects: Project[], existingTags: string[]): Promise<ClassifyResult> {
  const res = await fetch("/api/ai/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      projects: projects.filter((p) => p.id !== "inbox").map((p) => ({ id: p.id, name: p.name })),
      existingTags,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function aiPlan(tasks: Task[], projects: Project[], opts?: { availableMinutes?: number; focus?: string }): Promise<PlanResult> {
  const projectsById = new Map(projects.map((p) => [p.id, p.name]));
  const today = todayISO();
  const candidates = tasks
    .filter((t) => !t.done && !t.waiting)
    .map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      projectName: t.projectId ? projectsById.get(t.projectId) : undefined,
      dueDate: t.dueDate,
      overdue: t.dueDate ? diffDays(t.dueDate) < 0 : false,
      estimateMinutes: t.estimateMinutes,
      tags: t.tags,
    }))
    .slice(0, 150);

  const res = await fetch("/api/ai/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tasks: candidates,
      today,
      availableMinutes: opts?.availableMinutes,
      focus: opts?.focus,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function aiChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  tasks: Task[],
  projects: Project[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const projectsById = new Map(projects.map((p) => [p.id, p.name]));
  const taskBrief = tasks.slice(0, 300).map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    done: t.done,
    waiting: t.waiting,
    waitingFor: t.waitingFor,
    projectName: t.projectId ? projectsById.get(t.projectId) : undefined,
    dueDate: t.dueDate,
    tags: t.tags,
  }));

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      tasks: taskBrief,
      today: todayISO(),
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: "Erreur" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}

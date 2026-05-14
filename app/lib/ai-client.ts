"use client";

import { Priority, Project, Task } from "./types";
import { todayISO, diffDays } from "./dates";
import { recordAiCost } from "./ai-cost-tracker";
import { loadProfile, profileToSystemBlock } from "./user-profile";

function currentProfile(): string | undefined {
  const p = loadProfile();
  return profileToSystemBlock(p) ?? undefined;
}

export type ClassifyResult = {
  priority: Priority;
  projectId: string | null;
  tags: string[];
  subtasks: string[];
  note?: string;
};

export type PlanResult = {
  selectedIds: string[]; // legacy
  schedule: Array<{
    taskId: string;
    suggestedTime: string; // HH:MM
    durationMinutes: number;
    reasoning: string;
  }>;
  reasoning: string;
  warnings: string[];
};

export type EventBrief = {
  summary: string;
  start: string; // HH:MM
  end: string;
  calendar?: string;
};

export type FreeSlotBrief = {
  start: string;
  end: string;
  minutes: number;
};

export type BreakdownStep = {
  title: string;
  estimateMinutes: number;
  daysOffset: number;
};

export type BreakdownSection = {
  name: string;
  steps: BreakdownStep[];
};

export type BreakdownResult = {
  summary: string;
  sections: BreakdownSection[];
  tags: string[];
};

export async function aiBreakdown(opts: {
  title: string;
  notes?: string;
  projectName?: string;
  estimateMinutes?: number;
  context?: string;
}): Promise<BreakdownResult> {
  const res = await fetch("/api/ai/breakdown", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...opts, profile: currentProfile() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data?.usage?.cost) recordAiCost("breakdown", data.usage.cost);
  return data;
}

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
  const data = await res.json();
  if (data?.usage?.cost) recordAiCost("classify", data.usage.cost);
  return data;
}

export async function aiPlan(
  tasks: Task[],
  projects: Project[],
  opts?: {
    availableMinutes?: number;
    focus?: string;
    events?: EventBrief[];
    freeSlots?: FreeSlotBrief[];
    workWindow?: { start: string; end: string };
  }
): Promise<PlanResult> {
  const projectsById = new Map(projects.map((p) => [p.id, p.name]));
  const today = todayISO();
  const candidates = tasks
    .filter((t) => !t.done && !t.waiting && !t.deletedAt)
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
      events: opts?.events,
      freeSlots: opts?.freeSlots,
      workWindow: opts?.workWindow,
      profile: currentProfile(),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data?.usage?.cost) recordAiCost("plan", data.usage.cost);
  return data;
}

export type Suggestion = {
  kind: "focus" | "reschedule" | "followup" | "cleanup" | "waiting" | "insight" | "workload" | "snoozed";
  title: string;
  detail?: string;
  taskIds: string[];
  action: "mark_today" | "snooze_tomorrow" | "snooze_week" | "mark_waiting" | "delete" | "none";
};

export type SuggestResult = {
  headline: string;
  suggestions: Suggestion[];
};

export type WeekAgendaDay = {
  date: string;
  events: number;
  totalMinutes: number;
  freeMinutes: number;
};

export async function aiSuggest(
  tasks: Task[],
  projects: Project[],
  weekAgenda?: WeekAgendaDay[]
): Promise<SuggestResult> {
  const projectsById = new Map(projects.map((p) => [p.id, p.name]));
  const candidates = tasks
    .filter((t) => !t.done && !t.deletedAt)
    .map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      projectName: t.projectId ? projectsById.get(t.projectId) : undefined,
      dueDate: t.dueDate,
      waiting: t.waiting,
      waitingFor: t.waitingFor,
      tags: t.tags,
      createdAt: t.createdAt,
      estimateMinutes: t.estimateMinutes,
      snoozeCount: t.snoozeCount,
    }));
  const res = await fetch("/api/ai/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks: candidates, today: todayISO(), weekAgenda, profile: currentProfile() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data?.cost) recordAiCost("suggest", data.cost);
  return data;
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; input: Record<string, unknown> }
  | { type: "done"; cost?: number }
  | { type: "error"; error: string };

export type ChatCalendarContext = {
  events?: Array<{ date: string; start: string; end: string; summary: string; calendar?: string }>;
  freeSlotsToday?: Array<{ date: string; start: string; end: string; minutes: number }>;
  hasGoogleConnected?: boolean;
};

export async function aiChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  tasks: Task[],
  projects: Project[],
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
  ctx?: ChatCalendarContext
): Promise<void> {
  const projectsById = new Map(projects.map((p) => [p.id, p.name]));
  const taskBrief = tasks
    .filter((t) => !t.deletedAt)
    .slice(0, 300)
    .map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      done: t.done,
      waiting: t.waiting,
      waitingFor: t.waitingFor,
      projectId: t.projectId,
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
      projects: projects.filter((p) => p.id !== "inbox").map((p) => ({ id: p.id, name: p.name })),
      today: todayISO(),
      events: ctx?.events,
      freeSlotsToday: ctx?.freeSlotsToday,
      hasGoogleConnected: ctx?.hasGoogleConnected,
      profile: currentProfile(),
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: "Erreur" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as ChatEvent;
        if (ev.type === "done" && ev.cost) recordAiCost("chat", ev.cost);
        onEvent(ev);
      } catch {}
    }
  }
  if (buf.trim()) {
    try {
      const ev = JSON.parse(buf) as ChatEvent;
      if (ev.type === "done" && ev.cost) recordAiCost("chat", ev.cost);
      onEvent(ev);
    } catch {}
  }
}

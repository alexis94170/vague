"use client";

import { Project, Task } from "./types";

const QUEUE_KEY = "vague:offline-queue:v1";
const STATE_CACHE_KEY = "vague:state-cache:v1";

export type QueueOp =
  | { kind: "upsertTask"; task: Task }
  | { kind: "upsertTasks"; tasks: Task[] }
  | { kind: "deleteTask"; id: string }
  | { kind: "deleteTasks"; ids: string[] }
  | { kind: "upsertProject"; project: Project }
  | { kind: "deleteProject"; id: string };

export type QueuedOp = QueueOp & { id: string; ts: number };

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadQueue(): QueuedOp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedOp[];
  } catch {
    return [];
  }
}

export function saveQueue(ops: QueuedOp[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
  } catch {}
}

export function enqueue(op: QueueOp): QueuedOp {
  const queued: QueuedOp = { ...op, id: uid(), ts: Date.now() };
  const current = loadQueue();
  current.push(queued);
  saveQueue(current);
  return queued;
}

export function clearQueue() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(QUEUE_KEY);
}

export function removeOp(opId: string) {
  const current = loadQueue();
  const next = current.filter((o) => o.id !== opId);
  saveQueue(next);
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

// Cache AppState locally for fast/offline boot
export function cacheState(state: { projects: Project[]; tasks: Task[] }) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STATE_CACHE_KEY, JSON.stringify({
      ts: Date.now(),
      projects: state.projects,
      tasks: state.tasks,
    }));
  } catch {}
}

export function loadCachedState(): { projects: Project[]; tasks: Task[]; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STATE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearStateCache() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STATE_CACHE_KEY);
}

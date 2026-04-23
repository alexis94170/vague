"use client";

import { Project, Task } from "./types";

const KEY = "vague:backups:v1";
const LAST_KEY = "vague:backup-last:v1";
const MAX_BACKUPS = 14; // keep last 14 days

type Backup = {
  ts: number;
  date: string; // YYYY-MM-DD
  projects: Project[];
  tasks: Task[];
};

export function loadBackups(): Backup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Backup[];
  } catch {
    return [];
  }
}

function saveBackups(list: Backup[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("Backup localStorage full, trimming", e);
    // If quota exceeded, keep only the most recent 3
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(-3)));
    } catch {}
  }
}

export function runDailyBackup(projects: Project[], tasks: Task[]): boolean {
  if (typeof window === "undefined") return false;
  if (projects.length === 0 && tasks.length === 0) return false;

  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem(LAST_KEY);
  if (last === today) return false;

  const current = loadBackups();
  // Remove any existing backup for today (e.g., if user clears last flag)
  const filtered = current.filter((b) => b.date !== today);
  filtered.push({
    ts: Date.now(),
    date: today,
    projects,
    tasks,
  });

  // Keep last N
  const trimmed = filtered.slice(-MAX_BACKUPS);
  saveBackups(trimmed);
  localStorage.setItem(LAST_KEY, today);
  return true;
}

export function restoreBackup(ts: number): Backup | null {
  const list = loadBackups();
  return list.find((b) => b.ts === ts) ?? null;
}

export function deleteBackup(ts: number) {
  const list = loadBackups().filter((b) => b.ts !== ts);
  saveBackups(list);
}

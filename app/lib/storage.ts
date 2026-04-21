import { AppState } from "./types";

const KEY_V2 = "vague:state:v2";
const KEY_V1 = "vague:tasks:v1";

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DEFAULT_STATE: AppState = {
  version: 2,
  tasks: [],
  projects: [
    { id: "inbox", name: "Boîte de réception", color: "#64748b", order: 0 },
  ],
  settings: { theme: "system" },
};

function migrateV1(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY_V1);
    if (!raw) return null;
    const v1 = JSON.parse(raw) as Array<{
      id: string;
      title: string;
      done: boolean;
      priority: string;
      category?: string;
      dueDate?: string;
      subtasks: Array<{ id: string; title: string; done: boolean }>;
      createdAt: string;
    }>;
    const categoryToProjectId = new Map<string, string>();
    const projects = [...DEFAULT_STATE.projects];
    v1.forEach((t) => {
      if (t.category && !categoryToProjectId.has(t.category)) {
        const id = newId();
        categoryToProjectId.set(t.category, id);
        projects.push({
          id,
          name: t.category,
          color: "#6366f1",
          order: projects.length,
        });
      }
    });
    const tasks = v1.map((t, i) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      priority: (t.priority === "low" || t.priority === "medium" || t.priority === "high"
        ? t.priority
        : "none") as AppState["tasks"][number]["priority"],
      projectId: t.category ? categoryToProjectId.get(t.category) : undefined,
      tags: [],
      dueDate: t.dueDate,
      subtasks: t.subtasks,
      createdAt: t.createdAt,
      order: i,
    }));
    return { ...DEFAULT_STATE, projects, tasks };
  } catch {
    return null;
  }
}

export function loadState(): AppState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && parsed.version === 2) return parsed;
    }
    const migrated = migrateV1();
    if (migrated) {
      saveState(migrated);
      return migrated;
    }
  } catch {}
  return DEFAULT_STATE;
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_V2, JSON.stringify(state));
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeIds(state: AppState): AppState {
  const idMap = new Map<string, string>();
  const projects = state.projects
    .filter((p) => p.id !== "inbox")
    .map((p) => {
      const newPid = UUID_RE.test(p.id) ? p.id : newId();
      idMap.set(p.id, newPid);
      return { ...p, id: newPid };
    });
  const tasks = state.tasks.map((t) => ({
    ...t,
    id: UUID_RE.test(t.id) ? t.id : newId(),
    projectId: t.projectId ? (idMap.get(t.projectId) ?? (UUID_RE.test(t.projectId) ? t.projectId : undefined)) : undefined,
    subtasks: (t.subtasks ?? []).map((s) => ({ ...s, id: UUID_RE.test(s.id) ? s.id : newId() })),
  }));
  return { ...state, projects, tasks };
}

export function importState(json: string): AppState | null {
  try {
    const parsed = JSON.parse(json) as AppState;
    if (parsed.version === 2 && Array.isArray(parsed.tasks) && Array.isArray(parsed.projects)) {
      return normalizeIds(parsed);
    }
  } catch {}
  return null;
}

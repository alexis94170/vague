"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  DEFAULT_PROJECT_COLORS,
  Project,
  Task,
  Priority,
} from "./lib/types";
import { newId } from "./lib/storage";
import { nextOccurrence } from "./lib/recurrence";
import { ParsedInput } from "./lib/parser";
import { useAuth } from "./auth";
import {
  deleteProjectDb,
  deleteTaskDb,
  deleteTasksDb,
  fetchAll,
  restoreTask as restoreTaskDb,
  restoreTasks as restoreTasksDb,
  softDeleteTask,
  softDeleteTasks,
  upsertProject,
  upsertTask,
  upsertTasks,
} from "./lib/db";
import { supabase } from "./lib/supabase";
import {
  cacheState,
  enqueue as enqueueOffline,
  isOnline,
  loadCachedState,
  loadQueue,
  QueueOp,
  removeOp,
  saveQueue,
} from "./lib/offline-queue";

type Ctx = {
  state: AppState;
  tasks: Task[];
  projects: Project[];
  allTags: string[];
  loading: boolean;
  syncing: boolean;
  syncError: string | null;
  online: boolean;
  pendingOps: number;
  addTaskFromParsed: (p: ParsedInput, fallbackProjectId?: string) => Task;
  addTask: (input: Partial<Task> & { title: string }) => Task;
  bulkAddTasks: (titles: string[], projectId?: string) => void;
  mergeImport: (projects: Project[], tasks: Task[]) => void;
  updateTask: (task: Task) => void;
  patchTask: (id: string, patch: Partial<Task>) => void;
  toggleDone: (id: string) => void;
  deleteTask: (id: string) => void;
  deleteTasks: (ids: string[]) => void;
  hardDeleteTask: (id: string) => void;
  hardDeleteTasks: (ids: string[]) => void;
  restoreTask: (id: string) => void;
  restoreTasks: (ids: string[]) => void;
  emptyTrash: () => void;
  patchTasks: (ids: string[], patch: Partial<Task>) => void;
  snoozeTask: (id: string, toISO: string) => void;
  addProject: (name: string) => Project;
  renameProject: (id: string, name: string) => void;
  recolorProject: (id: string, color: string) => void;
  deleteProject: (id: string) => void;
  reorderProjects: (ids: string[]) => void;
  replaceState: (s: AppState) => void;
  clearCompleted: () => void;
  refetch: () => Promise<void>;
};

const StoreContext = createContext<Ctx | null>(null);

const EMPTY: AppState = {
  version: 2,
  tasks: [],
  projects: [],
  settings: { theme: "system" },
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<AppState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pendingOps, setPendingOps] = useState(0);
  const pending = useRef(0);
  const refreshQueueCount = useCallback(() => setPendingOps(loadQueue().length), []);

  // Load from DB when user available — use cache first for instant boot
  const load = useCallback(async () => {
    if (!user) {
      setState(EMPTY);
      setLoading(false);
      return;
    }
    // 1. Show cached state immediately for snappy offline boot
    const cached = loadCachedState();
    if (cached) {
      setState({ version: 2, projects: cached.projects, tasks: cached.tasks, settings: { theme: "system" } });
      setLoading(false);
    } else {
      setLoading(true);
    }
    // 2. Fetch fresh if online
    if (!isOnline()) {
      setLoading(false);
      setSyncError("Hors-ligne — données en cache");
      return;
    }
    try {
      const data = await fetchAll(user.id);
      setState(data);
      cacheState({ projects: data.projects, tasks: data.tasks });
      setSyncError(null);
    } catch (e) {
      const msg = (e as Error).message;
      if (!cached) setSyncError(`Chargement impossible : ${msg}`);
      console.error("fetchAll failed", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Cache state on every change
  useEffect(() => {
    if (loading) return;
    if (state.projects.length > 0 || state.tasks.length > 0) {
      cacheState({ projects: state.projects, tasks: state.tasks });
    }
  }, [state, loading]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: refetch on DB changes
  useEffect(() => {
    if (!user) return;
    const sb = supabase();
    const channel = sb
      .channel(`user:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${user.id}` }, () => {
        load();
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [user, load]);

  const withSync = useCallback(async (op: () => Promise<void>, queueOp?: QueueOp) => {
    // If offline and we have a queueable op, enqueue it and skip the live call
    if (!isOnline() && queueOp) {
      enqueueOffline(queueOp);
      refreshQueueCount();
      return;
    }
    pending.current += 1;
    setSyncing(true);
    try {
      await op();
      setSyncError(null);
    } catch (e) {
      const msg = (e as Error).message;
      // Likely a network failure — enqueue for later if we have an op
      if (queueOp && /failed|network|fetch|offline/i.test(msg)) {
        enqueueOffline(queueOp);
        refreshQueueCount();
        setSyncError("Sync impossible — en attente de reconnexion");
      } else {
        setSyncError(msg);
      }
      console.error("sync failed", e);
    } finally {
      pending.current -= 1;
      if (pending.current <= 0) setSyncing(false);
    }
  }, [refreshQueueCount]);

  // Online/offline detection + queue flush
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      setOnline(true);
      flushQueue();
    };
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Flush queued ops when back online
  const flushQueue = useCallback(async () => {
    if (!user || !isOnline()) return;
    const ops = loadQueue();
    if (ops.length === 0) return;
    setSyncing(true);
    for (const op of ops) {
      try {
        switch (op.kind) {
          case "upsertTask":
            await upsertTask(op.task, user.id);
            break;
          case "upsertTasks":
            await upsertTasks(op.tasks, user.id);
            break;
          case "deleteTask":
            await deleteTaskDb(op.id);
            break;
          case "deleteTasks":
            await deleteTasksDb(op.ids);
            break;
          case "upsertProject":
            await upsertProject(op.project, user.id);
            break;
          case "deleteProject":
            await deleteProjectDb(op.id);
            break;
        }
        removeOp(op.id);
      } catch (e) {
        console.warn("Flush op failed, keeping in queue:", e);
        break; // stop; retry next time
      }
    }
    refreshQueueCount();
    setSyncing(false);
  }, [user, refreshQueueCount]);

  // Initial queue count + attempt flush on mount
  useEffect(() => {
    refreshQueueCount();
    if (user && isOnline()) flushQueue();
  }, [user, refreshQueueCount, flushQueue]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    state.tasks.forEach((t) => t.tags.forEach((g) => s.add(g)));
    return Array.from(s).sort();
  }, [state.tasks]);

  const addTask = useCallback((input: Partial<Task> & { title: string }) => {
    const task: Task = {
      id: newId(),
      title: input.title,
      notes: input.notes,
      done: false,
      priority: input.priority ?? "none",
      projectId: input.projectId,
      tags: input.tags ?? [],
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      estimateMinutes: input.estimateMinutes,
      subtasks: input.subtasks ?? [],
      recurrence: input.recurrence,
      createdAt: new Date().toISOString(),
      order: 0,
    };
    setState((s) => ({ ...s, tasks: [task, ...s.tasks] }));
    if (user) withSync(() => upsertTask(task, user.id), { kind: "upsertTask", task });
    return task;
  }, [user, withSync]);

  const addProject = useCallback((name: string) => {
    const trimmed = name.trim();
    const color =
      DEFAULT_PROJECT_COLORS[
        Math.floor(Math.random() * DEFAULT_PROJECT_COLORS.length)
      ];
    const project: Project = {
      id: newId(),
      name: trimmed,
      color,
      order: 0,
    };
    setState((s) => {
      const newProj = { ...project, order: s.projects.length };
      if (user) withSync(() => upsertProject(newProj, user.id), { kind: "upsertProject", project: newProj });
      return { ...s, projects: [...s.projects, newProj] };
    });
    return project;
  }, [user, withSync]);

  const addTaskFromParsed = useCallback(
    (p: ParsedInput, fallbackProjectId?: string) => {
      let projectId = p.projectId ?? fallbackProjectId;
      if (!projectId && p.projectName) {
        const created = addProject(p.projectName);
        projectId = created.id;
      }
      return addTask({
        title: p.title || "Sans titre",
        projectId,
        tags: p.tags,
        priority: p.priority ?? "none",
        dueDate: p.dueDate,
        dueTime: p.dueTime,
        estimateMinutes: p.estimateMinutes,
        recurrence: p.recurrence,
      });
    },
    [addProject, addTask]
  );

  const bulkAddTasks = useCallback((titles: string[], projectId?: string) => {
    const now = new Date().toISOString();
    const newTasks: Task[] = titles
      .map((title) => title.trim())
      .filter(Boolean)
      .map((title) => ({
        id: newId(),
        title,
        done: false,
        priority: "none" as Priority,
        projectId,
        tags: [],
        subtasks: [],
        createdAt: now,
        order: 0,
      }));
    if (newTasks.length === 0) return;
    setState((s) => ({ ...s, tasks: [...newTasks, ...s.tasks] }));
    if (user) withSync(() => upsertTasks(newTasks, user.id), { kind: "upsertTasks", tasks: newTasks });
  }, [user, withSync]);

  const mergeImport = useCallback((newProjects: Project[], newTasks: Task[]) => {
    setState((s) => {
      const reordered = newProjects.map((p, i) => ({ ...p, order: s.projects.length + i }));
      if (user) {
        withSync(async () => {
          await Promise.all(reordered.map((p) => upsertProject(p, user.id)));
          await upsertTasks(newTasks, user.id);
        });
      }
      return {
        ...s,
        projects: [...s.projects, ...reordered],
        tasks: [...newTasks, ...s.tasks],
      };
    });
  }, [user, withSync]);

  const updateTask = useCallback((task: Task) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
    if (user) withSync(() => upsertTask(task, user.id), { kind: "upsertTask", task });
  }, [user, withSync]);

  const patchTask = useCallback((id: string, patch: Partial<Task>) => {
    setState((s) => {
      const next = s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
      const task = next.find((t) => t.id === id);
      if (task && user) withSync(() => upsertTask(task, user.id), { kind: "upsertTask", task });
      return { ...s, tasks: next };
    });
  }, [user, withSync]);

  const toggleDone = useCallback((id: string) => {
    setState((s) => {
      const tasks = s.tasks.map((t) => {
        if (t.id !== id) return t;
        const nowDone = !t.done;
        return { ...t, done: nowDone, doneAt: nowDone ? new Date().toISOString() : undefined };
      });
      const toggled = tasks.find((t) => t.id === id);
      const original = s.tasks.find((t) => t.id === id);
      let added: Task | null = null;
      if (original && !original.done && original.recurrence && original.dueDate) {
        const next = nextOccurrence(original.dueDate, original.recurrence);
        added = {
          ...original,
          id: newId(),
          done: false,
          doneAt: undefined,
          dueDate: next,
          createdAt: new Date().toISOString(),
          subtasks: original.subtasks.map((st) => ({ ...st, id: newId(), done: false })),
        };
      }
      if (user) {
        const ops: Task[] = [];
        if (toggled) ops.push(toggled);
        if (added) ops.push(added);
        withSync(
          async () => {
            if (toggled) await upsertTask(toggled, user.id);
            if (added) await upsertTask(added, user.id);
          },
          ops.length > 0 ? { kind: "upsertTasks", tasks: ops } : undefined
        );
      }
      return added ? { ...s, tasks: [added, ...tasks] } : { ...s, tasks };
    });
  }, [user, withSync]);

  // Soft delete (default) — task goes to trash, restorable for 30 days
  const deleteTask = useCallback((id: string) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, deletedAt: now } : t)),
    }));
    if (user) withSync(() => softDeleteTask(id));
  }, [user, withSync]);

  const deleteTasks = useCallback((ids: string[]) => {
    const set = new Set(ids);
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (set.has(t.id) ? { ...t, deletedAt: now } : t)),
    }));
    if (user) withSync(() => softDeleteTasks(ids));
  }, [user, withSync]);

  // Hard delete (permanent) — used in trash view and cleanup
  const hardDeleteTask = useCallback((id: string) => {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
    if (user) withSync(() => deleteTaskDb(id), { kind: "deleteTask", id });
  }, [user, withSync]);

  const hardDeleteTasks = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => !set.has(t.id)) }));
    if (user) withSync(() => deleteTasksDb(ids), { kind: "deleteTasks", ids });
  }, [user, withSync]);

  const restoreTask = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, deletedAt: undefined } : t)),
    }));
    if (user) withSync(() => restoreTaskDb(id));
  }, [user, withSync]);

  const restoreTasks = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (set.has(t.id) ? { ...t, deletedAt: undefined } : t)),
    }));
    if (user) withSync(() => restoreTasksDb(ids));
  }, [user, withSync]);

  const emptyTrash = useCallback(() => {
    setState((s) => {
      const toDelete = s.tasks.filter((t) => t.deletedAt).map((t) => t.id);
      if (user && toDelete.length > 0) withSync(() => deleteTasksDb(toDelete));
      return { ...s, tasks: s.tasks.filter((t) => !t.deletedAt) };
    });
  }, [user, withSync]);

  const patchTasks = useCallback((ids: string[], patch: Partial<Task>) => {
    const set = new Set(ids);
    setState((s) => {
      const next = s.tasks.map((t) => (set.has(t.id) ? { ...t, ...patch } : t));
      const updated = next.filter((t) => set.has(t.id));
      if (user && updated.length > 0) withSync(() => upsertTasks(updated, user.id), { kind: "upsertTasks", tasks: updated });
      return { ...s, tasks: next };
    });
  }, [user, withSync]);

  const snoozeTask = useCallback((id: string, toISO: string) => {
    setState((s) => {
      const next = s.tasks.map((t) =>
        t.id === id ? { ...t, dueDate: toISO, snoozedUntil: toISO } : t
      );
      const updated = next.find((t) => t.id === id);
      if (updated && user) withSync(() => upsertTask(updated, user.id), { kind: "upsertTask", task: updated });
      return { ...s, tasks: next };
    });
  }, [user, withSync]);

  const renameProject = useCallback((id: string, name: string) => {
    setState((s) => {
      const next = s.projects.map((p) => (p.id === id ? { ...p, name } : p));
      const updated = next.find((p) => p.id === id);
      if (updated && user) withSync(() => upsertProject(updated, user.id), { kind: "upsertProject", project: updated });
      return { ...s, projects: next };
    });
  }, [user, withSync]);

  const recolorProject = useCallback((id: string, color: string) => {
    setState((s) => {
      const next = s.projects.map((p) => (p.id === id ? { ...p, color } : p));
      const updated = next.find((p) => p.id === id);
      if (updated && user) withSync(() => upsertProject(updated, user.id), { kind: "upsertProject", project: updated });
      return { ...s, projects: next };
    });
  }, [user, withSync]);

  const deleteProject = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      projects: s.projects.filter((p) => p.id !== id),
      tasks: s.tasks.map((t) =>
        t.projectId === id ? { ...t, projectId: undefined } : t
      ),
    }));
    if (user) withSync(() => deleteProjectDb(id), { kind: "deleteProject", id });
  }, [user, withSync]);

  const reorderProjects = useCallback((ids: string[]) => {
    setState((s) => {
      const map = new Map(s.projects.map((p) => [p.id, p]));
      const ordered = ids
        .map((id, i) => {
          const p = map.get(id);
          return p ? { ...p, order: i } : null;
        })
        .filter((p): p is Project => p !== null);
      if (user) withSync(() => Promise.all(ordered.map((p) => upsertProject(p, user.id))).then(() => {}));
      return { ...s, projects: ordered };
    });
  }, [user, withSync]);

  const replaceState = useCallback((next: AppState) => {
    setState(next);
    if (user) {
      withSync(async () => {
        await Promise.all(next.projects.map((p) => upsertProject(p, user.id)));
        await upsertTasks(next.tasks, user.id);
      });
    }
  }, [user, withSync]);

  const clearCompleted = useCallback(() => {
    setState((s) => {
      const toDelete = s.tasks.filter((t) => t.done).map((t) => t.id);
      if (user && toDelete.length > 0) withSync(() => deleteTasksDb(toDelete), { kind: "deleteTasks", ids: toDelete });
      return { ...s, tasks: s.tasks.filter((t) => !t.done) };
    });
  }, [user, withSync]);

  const value: Ctx = {
    state,
    tasks: state.tasks,
    projects: state.projects,
    allTags,
    loading,
    syncing,
    online,
    pendingOps,
    syncError,
    addTaskFromParsed,
    addTask,
    bulkAddTasks,
    mergeImport,
    updateTask,
    patchTask,
    toggleDone,
    deleteTask,
    deleteTasks,
    hardDeleteTask,
    hardDeleteTasks,
    restoreTask,
    restoreTasks,
    emptyTrash,
    patchTasks,
    snoozeTask,
    addProject,
    renameProject,
    recolorProject,
    deleteProject,
    reorderProjects,
    replaceState,
    clearCompleted,
    refetch: load,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

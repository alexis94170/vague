import { Task } from "./types";
import { todayISO } from "./dates";

export type ViewKind =
  | { kind: "today" }
  | { kind: "calendar" }
  | { kind: "untriaged" }
  | { kind: "all" }
  | { kind: "waiting" }
  | { kind: "completed" }
  | { kind: "project"; id: string }
  | { kind: "tag"; tag: string }
  | { kind: "search"; q: string };

const excludeWaiting = (t: Task) => !t.waiting;

export function filterTasks(tasks: Task[], view: ViewKind): Task[] {
  const today = todayISO();
  switch (view.kind) {
    case "today":
      return tasks.filter((t) => !t.done && excludeWaiting(t) && t.dueDate && t.dueDate <= today);
    case "untriaged":
      return tasks.filter((t) => !t.done && excludeWaiting(t) && (!t.projectId || t.projectId === "inbox"));
    case "all":
      return tasks.filter((t) => !t.done && excludeWaiting(t));
    case "calendar":
      return tasks.filter((t) => !t.done && t.dueDate);
    case "waiting":
      return tasks.filter((t) => !t.done && t.waiting);
    case "completed":
      return tasks.filter((t) => t.done);
    case "project":
      return tasks.filter((t) => !t.done && t.projectId === view.id);
    case "tag":
      return tasks.filter((t) => !t.done && t.tags.includes(view.tag));
    case "search": {
      const q = view.q.toLowerCase();
      if (!q) return [];
      return tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.notes?.toLowerCase().includes(q) ?? false) ||
          t.tags.some((g) => g.toLowerCase().includes(q))
      );
    }
  }
}

export function viewTitle(view: ViewKind, projectName?: string): string {
  switch (view.kind) {
    case "today": return "Aujourd'hui";
    case "calendar": return "Calendrier";
    case "untriaged": return "À trier";
    case "all": return "Toutes les tâches";
    case "waiting": return "En attente";
    case "completed": return "Terminées";
    case "project": return projectName ?? "Projet";
    case "tag": return `#${view.tag}`;
    case "search": return `Recherche : « ${view.q} »`;
  }
}

import { Task } from "./types";
import { todayISO } from "./dates";

export type ViewKind =
  | { kind: "today" }
  | { kind: "dashboard" }
  | { kind: "calendar" }
  | { kind: "untriaged" }
  | { kind: "all" }
  | { kind: "waiting" }
  | { kind: "completed" }
  | { kind: "trash" }
  | { kind: "project"; id: string }
  | { kind: "tag"; tag: string }
  | { kind: "search"; q: string };

const excludeWaiting = (t: Task) => !t.waiting;
const alive = (t: Task) => !t.deletedAt;

export function filterTasks(tasks: Task[], view: ViewKind): Task[] {
  const today = todayISO();
  switch (view.kind) {
    case "today":
      return tasks.filter((t) => alive(t) && !t.done && excludeWaiting(t) && t.dueDate && t.dueDate <= today);
    case "untriaged":
      return tasks.filter((t) => alive(t) && !t.done && excludeWaiting(t) && (!t.projectId || t.projectId === "inbox"));
    case "all":
      return tasks.filter((t) => alive(t) && !t.done && excludeWaiting(t));
    case "calendar":
      return tasks.filter((t) => alive(t) && !t.done && t.dueDate);
    case "dashboard":
      return tasks.filter(alive);
    case "waiting":
      return tasks.filter((t) => alive(t) && !t.done && t.waiting);
    case "completed":
      return tasks.filter((t) => alive(t) && t.done);
    case "trash":
      return tasks.filter((t) => !!t.deletedAt);
    case "project":
      return tasks.filter((t) => alive(t) && !t.done && t.projectId === view.id);
    case "tag":
      return tasks.filter((t) => alive(t) && !t.done && t.tags.includes(view.tag));
    case "search": {
      const q = view.q.toLowerCase();
      if (!q) return [];
      return tasks.filter(
        (t) =>
          alive(t) && (
            t.title.toLowerCase().includes(q) ||
            (t.notes?.toLowerCase().includes(q) ?? false) ||
            t.tags.some((g) => g.toLowerCase().includes(q))
          )
      );
    }
  }
}

export function viewTitle(view: ViewKind, projectName?: string): string {
  switch (view.kind) {
    case "today": return "Aujourd'hui";
    case "dashboard": return "Tableau de bord";
    case "calendar": return "Calendrier";
    case "untriaged": return "À trier";
    case "all": return "Toutes les tâches";
    case "waiting": return "En attente";
    case "completed": return "Terminées";
    case "trash": return "Corbeille";
    case "project": return projectName ?? "Projet";
    case "tag": return `#${view.tag}`;
    case "search": return `Recherche : « ${view.q} »`;
  }
}

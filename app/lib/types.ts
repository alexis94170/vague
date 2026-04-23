export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export type RecurrenceUnit = "day" | "week" | "month" | "year";

export type Recurrence = {
  unit: RecurrenceUnit;
  interval: number;
  daysOfWeek?: number[];
};

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
};

export type Project = {
  id: string;
  name: string;
  color: string;
  order: number;
};

export type Task = {
  id: string;
  title: string;
  notes?: string;
  done: boolean;
  doneAt?: string;
  priority: Priority;
  projectId?: string;
  tags: string[];
  dueDate?: string;
  dueTime?: string;
  estimateMinutes?: number;
  subtasks: Subtask[];
  recurrence?: Recurrence;
  snoozedUntil?: string;
  waiting?: boolean;
  waitingFor?: string;
  deletedAt?: string;
  createdAt: string;
  order: number;
};

export type TaskTemplateItem = {
  title: string;
  priority?: Priority;
  tags?: string[];
  estimateMinutes?: number;
  notes?: string;
};

export type TaskTemplate = {
  id: string;
  name: string;
  icon?: string;
  color: string;
  items: TaskTemplateItem[];
  order: number;
};

export type Settings = {
  theme: "light" | "dark" | "system";
};

export type AppState = {
  version: number;
  tasks: Task[];
  projects: Project[];
  settings: Settings;
};

export const DEFAULT_PROJECT_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f97316",
  "#10b981",
  "#06b6d4",
  "#8b5cf6",
  "#eab308",
  "#ef4444",
];

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: "Aucune",
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  none: "text-zinc-400",
  low: "text-sky-500",
  medium: "text-amber-500",
  high: "text-orange-500",
  urgent: "text-rose-500",
};

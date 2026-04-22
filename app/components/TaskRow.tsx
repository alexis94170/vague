"use client";

import { Task } from "../lib/types";
import { formatDueLabel, todayISO } from "../lib/dates";
import { formatRecurrence } from "../lib/recurrence";
import { useStore } from "../store";
import Icon from "./Icon";

type Props = {
  task: Task;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onOpen: (id: string) => void;
};

const PRIORITY_ACCENT: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
  none: "bg-transparent",
};

const PRIORITY_CHECKBOX: Record<string, string> = {
  urgent: "border-rose-400 hover:border-rose-500",
  high: "border-orange-400 hover:border-orange-500",
  medium: "border-amber-400 hover:border-amber-500",
  low: "border-sky-400 hover:border-sky-500",
  none: "border-[var(--border-strong)] hover:border-[var(--accent)]",
};

export default function TaskRow({ task, selected, onToggleSelect, onOpen }: Props) {
  const { projects, toggleDone, patchTask } = useStore();
  const project = projects.find((p) => p.id === task.projectId);
  const due = formatDueLabel(task.dueDate);
  const subDone = task.subtasks.filter((s) => s.done).length;
  const subTotal = task.subtasks.length;
  const today = todayISO();
  const isToday = task.dueDate === today;

  return (
    <div
      className={`group relative flex items-start gap-3 px-4 py-3 transition-colors ${
        selected
          ? "bg-[var(--accent-soft)]/60"
          : task.waiting
            ? "bg-amber-500/5 hover:bg-amber-500/10"
            : "hover:bg-[var(--bg-hover)]/50"
      }`}
    >
      <div className={`absolute left-0 top-0 h-full w-0.5 ${task.waiting ? "bg-amber-500 opacity-80" : `${PRIORITY_ACCENT[task.priority]} ${task.priority === "none" ? "opacity-0" : "opacity-80"}`}`} />

      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onToggleSelect(task.id, (e.nativeEvent as MouseEvent).shiftKey)}
        onClick={(e) => e.stopPropagation()}
        className={`mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent)] transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-50"
        }`}
        title="Sélectionner"
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleDone(task.id);
        }}
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition ${
          task.done
            ? "border-[var(--accent)] bg-[var(--accent)] anim-check-pop"
            : PRIORITY_CHECKBOX[task.priority]
        }`}
        title={task.done ? "Marquer non fait" : "Marquer fait"}
      >
        {task.done && <Icon name="check" size={12} className="text-white" />}
      </button>

      <button
        onClick={() => onOpen(task.id)}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        <div
          className={`w-full break-words text-[13.5px] leading-snug transition ${
            task.done
              ? "text-[var(--text-subtle)] line-through"
              : "text-[var(--text)]"
          }`}
        >
          {task.title}
        </div>
        {(task.waiting || due || (project && project.id !== "inbox") || task.tags.length > 0 || subTotal > 0 || task.estimateMinutes || task.recurrence || task.notes) && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-[var(--text-muted)]">
            {task.waiting && (
              <span className="flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
                <Icon name="pause" size={10} />
                {task.waitingFor ? `Attente · ${task.waitingFor}` : "En attente"}
              </span>
            )}
            {due && (
              <span className={`flex items-center gap-1 ${due.tone}`}>
                <Icon name="clock" size={11} />
                {due.label}{task.dueTime ? ` · ${task.dueTime}` : ""}
              </span>
            )}
            {project && project.id !== "inbox" && (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: project.color }} />
                {project.name}
              </span>
            )}
            {task.tags.map((t) => (
              <span key={t} className="text-teal-600 dark:text-teal-400">#{t}</span>
            ))}
            {subTotal > 0 && (
              <span className="flex items-center gap-1">
                <Icon name="list" size={10} />
                {subDone}/{subTotal}
              </span>
            )}
            {task.estimateMinutes && (
              <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                <Icon name="clock" size={10} />
                {formatEstimate(task.estimateMinutes)}
              </span>
            )}
            {task.recurrence && (
              <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                <Icon name="repeat" size={10} />
                {formatRecurrence(task.recurrence)}
              </span>
            )}
            {task.notes && (
              <span className="flex items-center gap-1 text-[var(--text-subtle)]">
                <Icon name="note" size={10} />
              </span>
            )}
          </div>
        )}
      </button>

      {!task.done && (
        <div className="invisible absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 group-hover:visible md:flex">
          {!isToday && !task.waiting && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                patchTask(task.id, { dueDate: today });
              }}
              title="Ajouter à aujourd'hui"
              className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] shadow-sm transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
            >
              <span className="flex items-center gap-1">
                <Icon name="sun" size={11} />
                Aujourd'hui
              </span>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (task.waiting) {
                patchTask(task.id, { waiting: false, waitingFor: undefined });
              } else {
                const reason = prompt("En attente de quoi / qui ? (optionnel)") ?? "";
                patchTask(task.id, { waiting: true, waitingFor: reason.trim() || undefined });
              }
            }}
            title={task.waiting ? "Sortir de l'attente" : "Mettre en attente"}
            className={`rounded-md border px-2 py-1 text-[11px] font-medium shadow-sm transition ${
              task.waiting
                ? "border-amber-400/50 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300"
                : "border-[var(--border)] bg-[var(--bg-elev)] text-[var(--text-muted)] hover:border-amber-400/50 hover:text-amber-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <Icon name="pause" size={11} />
              {task.waiting ? "Reprendre" : "Attendre"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function formatEstimate(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, "0")}`;
}

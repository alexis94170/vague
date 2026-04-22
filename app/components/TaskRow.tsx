"use client";

import { useRef, useState } from "react";
import { Task } from "../lib/types";
import { formatDueLabel, todayISO, addDays } from "../lib/dates";
import { formatRecurrence } from "../lib/recurrence";
import { useStore } from "../store";
import { haptic } from "../lib/haptics";
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
  urgent: "border-rose-400",
  high: "border-orange-400",
  medium: "border-amber-400",
  low: "border-sky-400",
  none: "border-[var(--border-strong)]",
};

const SWIPE_THRESHOLD = 70;
const SWIPE_MAX = 120;

export default function TaskRow({ task, selected, onToggleSelect, onOpen }: Props) {
  const { projects, toggleDone, patchTask, deleteTask } = useStore();
  const project = projects.find((p) => p.id === task.projectId);
  const due = formatDueLabel(task.dueDate);
  const subDone = task.subtasks.filter((s) => s.done).length;
  const subTotal = task.subtasks.length;
  const today = todayISO();
  const isToday = task.dueDate === today;

  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontal.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (isHorizontal.current === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      }
    }

    if (isHorizontal.current) {
      e.stopPropagation();
      const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
      setSwipeX(clamped);
      setSwiping(true);
      if (Math.abs(clamped) === SWIPE_THRESHOLD) haptic("light");
    }
  }

  function onTouchEnd() {
    if (!swiping) {
      setSwipeX(0);
      return;
    }
    setSwiping(false);
    if (swipeX >= SWIPE_THRESHOLD) {
      haptic("success");
      toggleDone(task.id);
    } else if (swipeX <= -SWIPE_THRESHOLD) {
      haptic("medium");
      // snooze to tomorrow by default
      patchTask(task.id, { dueDate: addDays(todayISO(), 1) });
    }
    setSwipeX(0);
    isHorizontal.current = null;
  }

  const showMeta = task.waiting || due || (project && project.id !== "inbox") || task.tags.length > 0 || subTotal > 0 || task.estimateMinutes || task.recurrence || task.notes;
  const swipeProgress = Math.abs(swipeX) / SWIPE_THRESHOLD;
  const swipeReady = Math.abs(swipeX) >= SWIPE_THRESHOLD;

  return (
    <div className="relative overflow-hidden">
      {/* Swipe background reveals */}
      {swipeX > 0 && (
        <div className={`absolute inset-y-0 left-0 flex items-center gap-2 px-5 text-white transition-colors ${swipeReady ? "bg-emerald-500" : "bg-emerald-500/60"}`} style={{ width: Math.abs(swipeX) }}>
          <Icon name="check" size={22} />
          {swipeReady && <span className="text-[13px] font-semibold">Fait</span>}
        </div>
      )}
      {swipeX < 0 && (
        <div className={`absolute inset-y-0 right-0 flex items-center justify-end gap-2 px-5 text-white transition-colors ${swipeReady ? "bg-sky-500" : "bg-sky-500/60"}`} style={{ width: Math.abs(swipeX) }}>
          {swipeReady && <span className="text-[13px] font-semibold">Demain</span>}
          <Icon name="arrow-right" size={22} />
        </div>
      )}

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? "none" : "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.1)",
          opacity: 1 - swipeProgress * 0.15,
        }}
        className={`group relative flex items-start gap-3 px-4 py-3.5 transition-colors sm:gap-3 sm:px-4 sm:py-3 ${
          selected
            ? "bg-[var(--accent-soft)]"
            : task.waiting
              ? "bg-amber-500/5"
              : "bg-[var(--bg-elev)] touch-active hover:bg-[var(--bg-hover)]/60"
        }`}
      >
        {/* Priority accent bar */}
        <div
          className={`absolute left-0 top-0 h-full w-[3px] ${
            task.waiting ? "bg-amber-500 opacity-90" : `${PRIORITY_ACCENT[task.priority]} ${task.priority === "none" ? "opacity-0" : "opacity-90"}`
          }`}
        />

        {/* Multi-select checkbox (desktop hover only) */}
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(task.id, (e.nativeEvent as MouseEvent).shiftKey)}
          onClick={(e) => e.stopPropagation()}
          className={`mt-1.5 hidden h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)] transition-opacity md:inline-block ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-60"
          }`}
          title="Sélectionner"
        />

        {/* Completion checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            haptic("medium");
            toggleDone(task.id);
          }}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition active:scale-90 sm:h-[22px] sm:w-[22px] ${
            task.done
              ? "border-[var(--accent)] bg-[var(--accent)] anim-check-pop"
              : `${PRIORITY_CHECKBOX[task.priority]} hover:border-[var(--accent)]`
          }`}
          aria-label={task.done ? "Marquer non fait" : "Marquer fait"}
        >
          {task.done && <Icon name="check" size={13} className="text-white" />}
        </button>

        {/* Content */}
        <button
          onClick={() => onOpen(task.id)}
          className="flex min-w-0 flex-1 flex-col items-start gap-1.5 text-left sm:gap-1"
        >
          <div
            className={`w-full break-words text-[15px] leading-snug transition sm:text-[14px] ${
              task.done
                ? "text-[var(--text-subtle)] line-through"
                : "text-[var(--text)]"
            }`}
          >
            {task.title}
          </div>

          {showMeta && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--text-muted)] sm:text-[11.5px]">
              {task.waiting && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
                  <Icon name="pause" size={10} />
                  {task.waitingFor ? task.waitingFor : "En attente"}
                </span>
              )}
              {due && (
                <span className={`flex items-center gap-1 font-medium ${due.tone}`}>
                  <Icon name="clock" size={11} />
                  {due.label}{task.dueTime ? ` · ${task.dueTime}` : ""}
                </span>
              )}
              {project && project.id !== "inbox" && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />
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
              {task.notes && <Icon name="note" size={11} className="text-[var(--text-subtle)]" />}
            </div>
          )}
        </button>

        {/* Desktop hover actions */}
        {!task.done && (
          <div className="invisible absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 group-hover:visible md:flex">
            {!isToday && !task.waiting && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  patchTask(task.id, { dueDate: today });
                }}
                title="Aujourd'hui"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] shadow-sm transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
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
              title={task.waiting ? "Reprendre" : "Mettre en attente"}
              className={`rounded-lg border px-2 py-1 text-[11px] font-medium shadow-sm transition ${
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Supprimer "${task.title}" ?`)) deleteTask(task.id);
              }}
              title="Supprimer"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] shadow-sm transition hover:border-rose-400/50 hover:text-rose-600"
            >
              <Icon name="trash" size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatEstimate(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, "0")}`;
}

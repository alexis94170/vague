"use client";

import { useMemo, useRef, useState } from "react";
import { Task } from "../lib/types";
import { formatDueLabel, todayISO, addDays } from "../lib/dates";
import { formatRecurrence } from "../lib/recurrence";
import { useStore } from "../store";
import { useGoogle } from "../google";
import { findEventConflicts } from "../lib/calendar-utils";
import { haptic } from "../lib/haptics";
import Icon from "./Icon";

type Props = {
  task: Task;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onOpen: (id: string) => void;
  trashMode?: boolean;
  onRestore?: () => void;
  onHardDelete?: () => void;
};

const SWIPE_THRESHOLD = 70;
const SWIPE_MAX = 120;

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-orange-400",
  medium: "bg-amber-400",
  low: "bg-sky-400",
  none: "bg-transparent",
};

export default function TaskRow({ task, selected, onToggleSelect, onOpen, trashMode, onRestore, onHardDelete }: Props) {
  const { projects, toggleDone, patchTask, deleteTask } = useStore();
  const { eventsForDate, isConnected } = useGoogle();
  const project = projects.find((p) => p.id === task.projectId);
  const due = formatDueLabel(task.dueDate);
  const subDone = task.subtasks.filter((s) => s.done).length;
  const subTotal = task.subtasks.length;
  const today = todayISO();
  const isToday = task.dueDate === today;
  const isOverdue = task.dueDate && task.dueDate < today && !task.done;

  // Conflict detection: only for tasks with a dueTime + future + Google connected
  const conflicts = useMemo(() => {
    if (!isConnected || task.done || task.waiting) return [];
    if (!task.dueDate || !task.dueTime) return [];
    return findEventConflicts(task, eventsForDate(task.dueDate));
  }, [task, eventsForDate, isConnected]);
  const hasConflict = conflicts.length > 0;

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
      {/* Swipe reveals */}
      {swipeX > 0 && (
        <div
          className={`absolute inset-y-0 left-0 flex items-center gap-2 px-5 text-[var(--accent-fg)] transition-opacity ${
            swipeReady ? "bg-[var(--accent)] opacity-100" : "bg-[var(--accent)] opacity-60"
          }`}
          style={{ width: Math.abs(swipeX) }}
        >
          <Icon name="check" size={20} />
          {swipeReady && <span className="text-[12.5px] font-medium">Fait</span>}
        </div>
      )}
      {swipeX < 0 && (
        <div
          className={`absolute inset-y-0 right-0 flex items-center justify-end gap-2 px-5 text-white transition-opacity ${
            swipeReady ? "bg-[var(--text)] opacity-100" : "bg-[var(--text)] opacity-50"
          }`}
          style={{ width: Math.abs(swipeX) }}
        >
          {swipeReady && <span className="text-[12.5px] font-medium">Demain</span>}
          <Icon name="arrow-right" size={20} />
        </div>
      )}

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? "none" : "transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)",
          opacity: 1 - swipeProgress * 0.12,
        }}
        className={`group relative flex items-start gap-3 px-4 py-3.5 transition-colors sm:py-3 ${
          selected
            ? "bg-[var(--accent-soft)]"
            : "bg-[var(--bg-elev)] touch-active hover:bg-[var(--bg-hover)]/50"
        }`}
      >
        {/* Multi-select (desktop hover) */}
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(task.id, (e.nativeEvent as MouseEvent).shiftKey)}
          onClick={(e) => e.stopPropagation()}
          className={`mt-1.5 hidden h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)] transition-opacity md:inline-block ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-50"
          }`}
          title="Sélectionner"
        />

        {/* Completion checkbox — refined */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            haptic("medium");
            toggleDone(task.id);
          }}
          className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition active:scale-90 ${
            task.done
              ? "border-[var(--accent)] bg-[var(--accent)] anim-check-pop"
              : "border-[var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
          }`}
          aria-label={task.done ? "Marquer non fait" : "Marquer fait"}
        >
          {task.done && <Icon name="check" size={12} className="text-[var(--accent-fg)]" />}
        </button>

        {/* Content */}
        <button
          onClick={() => onOpen(task.id)}
          className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
        >
          <div className="flex w-full items-start gap-2">
            {/* Priority dot — only for urgent/high */}
            {!task.done && (task.priority === "urgent" || task.priority === "high") && (
              <span
                className={`mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_COLOR[task.priority]}`}
                aria-label={task.priority}
              />
            )}
            <div
              className={`min-w-0 flex-1 break-words text-[14.5px] font-medium leading-snug transition ${
                task.done
                  ? "text-[var(--text-subtle)] line-through decoration-[1.5px]"
                  : "text-[var(--text-strong)]"
              }`}
            >
              {task.title}
            </div>
          </div>

          {showMeta && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--text-muted)]">
              {task.waiting && (
                <span className="flex items-center gap-1 italic text-[var(--text-subtle)]">
                  <Icon name="pause" size={10} />
                  {task.waitingFor ? task.waitingFor : "En attente"}
                </span>
              )}
              {due && (
                <span className={`flex items-center gap-1 ${isOverdue ? "font-medium text-rose-600 dark:text-rose-400" : isToday ? "font-medium text-[var(--accent)]" : due.tone}`}>
                  <Icon name="clock" size={10} />
                  {due.label}{task.dueTime ? ` · ${task.dueTime}` : ""}
                </span>
              )}
              {hasConflict && (
                <span
                  className="flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400"
                  title={`Conflit avec ${conflicts.map((e) => e.summary || "Événement").join(", ")}`}
                >
                  ⚠ Conflit avec {conflicts[0].summary || "événement"}
                  {conflicts.length > 1 && ` +${conflicts.length - 1}`}
                </span>
              )}
              {project && project.id !== "inbox" && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: project.color }} />
                  {project.name}
                </span>
              )}
              {task.tags.map((t) => (
                <span key={t} className="text-[var(--text-subtle)]">#{t}</span>
              ))}
              {subTotal > 0 && (
                <span className="flex items-center gap-1.5">
                  <Icon name="list" size={10} />
                  <span className="num">{subDone}/{subTotal}</span>
                </span>
              )}
              {task.estimateMinutes && (
                <span className="flex items-center gap-1">
                  <Icon name="clock" size={10} />
                  {formatEstimate(task.estimateMinutes)}
                </span>
              )}
              {task.recurrence && (
                <span className="flex items-center gap-1">
                  <Icon name="repeat" size={10} />
                  {formatRecurrence(task.recurrence)}
                </span>
              )}
              {task.notes && <Icon name="note" size={10} className="text-[var(--text-subtle)]" />}
            </div>
          )}
        </button>

        {/* Trash actions */}
        {trashMode && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onRestore?.(); }}
              title="Restaurer"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
            >
              <span className="flex items-center gap-1">
                <Icon name="repeat" size={11} />
                Restaurer
              </span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onHardDelete?.(); }}
              title="Supprimer définitivement"
              className="rounded-md px-2 py-1 text-[var(--text-subtle)] hover:bg-[var(--bg-hover)] hover:text-rose-600"
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        )}

        {/* Desktop hover actions */}
        {!task.done && !trashMode && (
          <div className="invisible absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-0.5 shadow-sm group-hover:visible md:flex">
            {!isToday && !task.waiting && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  patchTask(task.id, { dueDate: today });
                }}
                title="Aujourd'hui"
                className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
              >
                <Icon name="sun" size={11} />
                Aujourd'hui
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
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              <Icon name="pause" size={11} />
              {task.waiting ? "Reprendre" : "Attendre"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Supprimer "${task.title}" ?`)) deleteTask(task.id);
              }}
              title="Supprimer"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-subtle)] hover:bg-[var(--bg-hover)] hover:text-rose-600"
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

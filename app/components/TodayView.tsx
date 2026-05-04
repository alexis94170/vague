"use client";

import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useToast } from "../toast";
import { PRIORITY_ORDER, Task } from "../lib/types";
import { todayISO } from "../lib/dates";
import TaskRow from "./TaskRow";
import Icon from "./Icon";

type Props = { onOpenTask: (id: string) => void };

type Section = {
  id: string;
  label: string;
  icon: "clock" | "sun" | "calendar" | "check";
  tone?: string;
  emptyHint?: string;
  tasks: Task[];
};

function sortTasks(arr: Task[]): Task[] {
  return [...arr].sort((a, b) => {
    const ta = a.dueTime ?? "99:99";
    const tb = b.dueTime ?? "99:99";
    if (ta !== tb) return ta.localeCompare(tb);
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

function timeSlot(time: string): "morning" | "afternoon" | "evening" {
  const [h] = time.split(":").map(Number);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export default function TodayView({ onOpenTask }: Props) {
  const { tasks, restoreTasks, hardDeleteTasks, deleteTasks, snoozeTask, patchTasks, clearCompleted } = useStore();
  const toast = useToast();
  const [showCompleted, setShowCompleted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const today = todayISO();
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const { sections, totals } = useMemo(() => {
    const overdue: Task[] = [];
    const morning: Task[] = [];
    const afternoon: Task[] = [];
    const evening: Task[] = [];
    const noTime: Task[] = [];
    const doneToday: Task[] = [];

    for (const t of tasks) {
      if (t.deletedAt) continue;
      // done today
      if (t.done) {
        if (t.doneAt && t.doneAt.slice(0, 10) === today) doneToday.push(t);
        continue;
      }
      if (t.waiting) continue;
      // overdue (date passée)
      if (t.dueDate && t.dueDate < today) {
        overdue.push(t);
        continue;
      }
      // tâches du jour
      if (t.dueDate === today) {
        if (!t.dueTime) {
          noTime.push(t);
        } else {
          const slot = timeSlot(t.dueTime);
          if (slot === "morning") morning.push(t);
          else if (slot === "afternoon") afternoon.push(t);
          else evening.push(t);
        }
      }
    }

    const sections: Section[] = [
      ...(overdue.length ? [{ id: "overdue", label: "En retard", icon: "calendar" as const, tone: "text-rose-500", tasks: sortTasks(overdue) }] : []),
      { id: "morning", label: "Matin", icon: "sun" as const, tasks: sortTasks(morning) },
      { id: "afternoon", label: "Après-midi", icon: "clock" as const, tasks: sortTasks(afternoon) },
      { id: "evening", label: "Soir", icon: "clock" as const, tasks: sortTasks(evening) },
      { id: "noTime", label: "Sans heure", icon: "calendar" as const, tasks: sortTasks(noTime) },
    ].filter((s) => s.tasks.length > 0);

    const totals = {
      total: overdue.length + morning.length + afternoon.length + evening.length + noTime.length,
      done: doneToday.length,
      urgent: [...overdue, ...morning, ...afternoon, ...evening, ...noTime].filter((t) => t.priority === "urgent").length,
      overdue: overdue.length,
      estimateMin: [...overdue, ...morning, ...afternoon, ...evening, ...noTime].reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0),
      doneToday,
    };

    return { sections, totals };
  }, [tasks, today]);

  const total = totals.total + totals.done;
  const pct = total > 0 ? Math.round((totals.done / total) * 100) : 0;
  const estimateLabel = totals.estimateMin > 0
    ? totals.estimateMin >= 60
      ? `~${Math.round(totals.estimateMin / 60)}h estimées`
      : `~${totals.estimateMin}min estimées`
    : null;

  function toggleSelect(id: string, _shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (totals.total === 0 && totals.done === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)]">
          <Icon name="check" size={20} />
        </span>
        <h3 className="mt-4 text-[15px] font-semibold">Rien aujourd&apos;hui</h3>
        <p className="mt-1 max-w-sm text-[13px] text-[var(--text-muted)]">
          Glisse une tâche depuis une autre vue, ou utilise <span className="text-[var(--text)]">Planifier</span> pour laisser l&apos;IA t&apos;en proposer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* HERO — minimalist, no gradient */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] px-5 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[18px] font-semibold tracking-tight text-[var(--text)]">
            {totals.total === 0 ? "Tout est fait." : `${totals.total} pour aujourd'hui`}
          </h3>
          {totals.urgent > 0 && (
            <span className="text-[11.5px] font-medium text-rose-600 dark:text-rose-400">
              {totals.urgent} urgente{totals.urgent > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {(totals.overdue > 0 || estimateLabel || totals.done > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
            {totals.overdue > 0 && (
              <span className="text-rose-600 dark:text-rose-400">{totals.overdue} en retard</span>
            )}
            {estimateLabel && <span>{estimateLabel}</span>}
            {totals.done > 0 && <span>{totals.done} faite{totals.done > 1 ? "s" : ""}</span>}
          </div>
        )}

        {total > 0 && (
          <div className="mt-4">
            <div className="relative h-1 overflow-hidden rounded-full bg-[var(--bg-hover)]">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                  pct === 100 ? "bg-emerald-500" : "bg-[var(--accent)]"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10.5px] tabular-nums text-[var(--text-muted)]">
              <span>{totals.done} / {total}</span>
              <span>{pct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Sections */}
      {sections.map((s) => {
        // Highlight current slot
        const isCurrent =
          (s.id === "morning" && nowMins < 12 * 60) ||
          (s.id === "afternoon" && nowMins >= 12 * 60 && nowMins < 17 * 60) ||
          (s.id === "evening" && nowMins >= 17 * 60);
        return (
          <section key={s.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
            <header className="flex items-center justify-between px-5 py-2.5">
              <div className="flex items-center gap-2">
                <h4 className={`text-[10.5px] font-semibold uppercase tracking-wider ${s.tone ?? "text-[var(--text-muted)]"}`}>
                  {s.label}
                </h4>
                {isCurrent && (
                  <span className="text-[10px] font-medium text-[var(--accent)]">
                    · Maintenant
                  </span>
                )}
              </div>
              <span className="text-[10.5px] tabular-nums text-[var(--text-subtle)]">{s.tasks.length}</span>
            </header>
            <div className="divide-y divide-[var(--border)]/60">
              {s.tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  selected={selected.has(t.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={onOpenTask}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Done today */}
      {totals.doneToday.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex w-full items-center justify-between px-5 py-2.5 hover:bg-[var(--bg-hover)]/50"
          >
            <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Faites · {totals.doneToday.length}
            </h4>
            <Icon name="chevron-right" size={12} className={`text-[var(--text-subtle)] transition-transform ${showCompleted ? "rotate-90" : ""}`} />
          </button>
          {showCompleted && (
            <div className="divide-y divide-[var(--border)]/60 border-t border-[var(--border)]">
              {totals.doneToday.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  selected={selected.has(t.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={onOpenTask}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Selection bar (if any selected) */}
      {selected.size > 0 && (
        <div className="sticky bottom-20 z-20 flex items-center justify-between rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-4 py-2 shadow-lg">
          <span className="text-[12px] font-medium">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                deleteTasks(Array.from(selected));
                toast.show({ message: `${selected.size} tâche(s) à la corbeille`, action: { label: "Annuler", onClick: () => restoreTasks(Array.from(selected)) } });
                setSelected(new Set());
              }}
              className="rounded-full px-3 py-1 text-[11.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            >
              Supprimer
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-full px-3 py-1 text-[11.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

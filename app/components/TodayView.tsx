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
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elev)] py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md">
          <Icon name="check" size={26} />
        </span>
        <h3 className="mt-4 text-[16px] font-semibold">Rien aujourd&apos;hui</h3>
        <p className="mt-1 max-w-sm text-[13px] text-[var(--text-muted)]">
          Tu peux glisser une tâche d&apos;une autre vue, ou utiliser <span className="font-medium text-[var(--text)]">Planifier ma journée</span> pour que l&apos;IA t&apos;en propose.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--accent-soft-2)] to-[var(--accent-soft)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-semibold text-[var(--text)]">
                {totals.total === 0 ? "Bravo, tout est fait." : `${totals.total} tâche${totals.total > 1 ? "s" : ""} pour aujourd'hui`}
              </h3>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
              {totals.urgent > 0 && (
                <span className="font-medium text-rose-600 dark:text-rose-400">⚠ {totals.urgent} urgente{totals.urgent > 1 ? "s" : ""}</span>
              )}
              {totals.overdue > 0 && (
                <span className="font-medium text-rose-600 dark:text-rose-400">⏰ {totals.overdue} en retard</span>
              )}
              {estimateLabel && <span>{estimateLabel}</span>}
              {totals.done > 0 && <span>✓ {totals.done} faite{totals.done > 1 ? "s" : ""}</span>}
            </div>
          </div>
        </div>

        {total > 0 && (
          <div className="mt-3">
            <div className="relative h-2 overflow-hidden rounded-full bg-[var(--bg-elev)]/50">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                  pct === 100 ? "bg-emerald-500" : "bg-[var(--accent)]"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10.5px] font-medium tabular-nums text-[var(--text-muted)]">
              <span>{totals.done} / {total} faites</span>
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
          <section key={s.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elev)]">
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Icon name={s.icon} size={13} className={s.tone ?? "text-[var(--text-muted)]"} />
                <h4 className={`text-[12px] font-semibold uppercase tracking-wider ${s.tone ?? "text-[var(--text-muted)]"}`}>
                  {s.label}
                </h4>
                {isCurrent && (
                  <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-[var(--accent)]">
                    Maintenant
                  </span>
                )}
              </div>
              <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-[var(--text-muted)]">{s.tasks.length}</span>
            </header>
            <div className="divide-y divide-[var(--border)]/40">
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
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elev)]">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex w-full items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/60 px-4 py-2.5 hover:bg-[var(--bg)]/80"
          >
            <div className="flex items-center gap-2">
              <Icon name="check" size={13} className="text-emerald-600" />
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Faites aujourd&apos;hui
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {totals.doneToday.length}
              </span>
              <Icon name={showCompleted ? "x" : "chevron-right"} size={13} className="text-[var(--text-subtle)]" />
            </div>
          </button>
          {showCompleted && (
            <div className="divide-y divide-[var(--border)]/40">
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

"use client";

import { useMemo } from "react";
import { useStore } from "../store";
import { PRIORITY_ORDER, Task } from "../lib/types";
import { addDays, formatFull, parseISODate, todayISO } from "../lib/dates";
import Icon from "./Icon";

type Props = { onOpenTask: (id: string) => void };

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
  none: "bg-[var(--text-subtle)]/40",
};

export default function AgendaView({ onOpenTask }: Props) {
  const { tasks, projects, toggleDone } = useStore();
  const today = todayISO();

  const projectsById = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    projects.forEach((p) => m.set(p.id, { name: p.name, color: p.color }));
    return m;
  }, [projects]);

  // Group by day — past due, today, tomorrow, day-by-day for next 30 days, then "later"
  const days = useMemo(() => {
    const byDate = new Map<string, Task[]>();
    let overdue: Task[] = [];
    let later: Task[] = [];

    tasks.forEach((t) => {
      if (t.done || t.waiting || t.deletedAt) return;
      if (!t.dueDate) return;
      if (t.dueDate < today) {
        overdue.push(t);
      } else if (t.dueDate > addDays(today, 30)) {
        later.push(t);
      } else {
        if (!byDate.has(t.dueDate)) byDate.set(t.dueDate, []);
        byDate.get(t.dueDate)!.push(t);
      }
    });

    const sortTasks = (arr: Task[]) =>
      [...arr].sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority];
        const pb = PRIORITY_ORDER[b.priority];
        if (pa !== pb) return pa - pb;
        const ta = a.dueTime ?? "99:99";
        const tb = b.dueTime ?? "99:99";
        return ta.localeCompare(tb);
      });

    overdue = sortTasks(overdue);
    later = sortTasks(later);

    const result: Array<{ date: string; label: string; tone?: string; tasks: Task[]; relative?: string }> = [];
    if (overdue.length > 0) result.push({ date: "overdue", label: "En retard", tone: "text-rose-500", tasks: overdue });

    const sortedDates = Array.from(byDate.keys()).sort();
    for (const date of sortedDates) {
      let label = formatFull(date);
      let relative = "";
      if (date === today) {
        label = "Aujourd'hui";
        relative = formatFull(date);
      } else if (date === addDays(today, 1)) {
        label = "Demain";
        relative = formatFull(date);
      }
      result.push({ date, label, relative, tasks: sortTasks(byDate.get(date)!) });
    }

    if (later.length > 0) result.push({ date: "later", label: "Plus tard (> 30 jours)", tasks: later });
    return result;
  }, [tasks, today]);

  const totalShown = days.reduce((n, d) => n + d.tasks.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[15px] font-semibold">Agenda</h3>
        <span className="text-[12px] text-[var(--text-muted)]">{totalShown} tâche{totalShown > 1 ? "s" : ""}</span>
      </div>

      {totalShown === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center text-[13px] text-[var(--text-muted)]">
          <Icon name="calendar" size={28} className="text-[var(--text-subtle)]" />
          <p className="mt-3">Pas de tâches datées. Ajoute des dates à tes tâches pour les voir ici.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d.date} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elev)]">
              <div className={`flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/50 px-4 py-2.5`}>
                <div>
                  <h4 className={`text-[13px] font-semibold ${d.tone ?? "text-[var(--text)]"}`}>
                    {d.label}
                  </h4>
                  {d.relative && <div className="text-[11px] text-[var(--text-muted)]">{d.relative}</div>}
                </div>
                <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{d.tasks.length}</span>
              </div>
              <div className="divide-y divide-[var(--border)]/40">
                {d.tasks.map((t) => {
                  const project = t.projectId ? projectsById.get(t.projectId) : null;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onOpenTask(t.id)}
                      className="group flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--bg-hover)]/40"
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleDone(t.id); }}
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--border-strong)] hover:border-[var(--accent)]"
                      >
                        <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                      </button>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13.5px] text-[var(--text)]">{t.title}</span>
                        <span className="flex items-center gap-2 text-[11.5px] text-[var(--text-muted)]">
                          {t.dueTime && <span className="tabular-nums font-medium text-[var(--text)]">{t.dueTime}</span>}
                          {project && (
                            <span className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: project.color }} />
                              {project.name}
                            </span>
                          )}
                          {t.estimateMinutes && <span>⏱ {t.estimateMinutes} min</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useStore } from "../store";
import { addDays, todayISO, toISODate, parseISODate } from "../lib/dates";
import { PRIORITY_ORDER, Task } from "../lib/types";
import { haptic } from "../lib/haptics";
import Icon from "./Icon";

type Props = {
  onOpenTask: (id: string) => void;
};

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
  none: "bg-[var(--text-subtle)]",
};

function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const firstDow = (first.getDay() + 6) % 7; // Mon=0, Sun=6
  const start = new Date(year, month, 1 - firstDow);
  const weeks: string[][] = [];
  const d = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(toISODate(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export default function CalendarView({ onOpenTask }: Props) {
  const { tasks, projects, patchTask } = useStore();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const projectsById = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    projects.forEach((p) => m.set(p.id, { name: p.name, color: p.color }));
    return m;
  }, [projects]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      if (t.done || !t.dueDate) return;
      if (!map.has(t.dueDate)) map.set(t.dueDate, []);
      map.get(t.dueDate)!.push(t);
    });
    for (const [k, list] of map) {
      list.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
      map.set(k, list);
    }
    return map;
  }, [tasks]);

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const monthLabel = `${MONTHS[cursor.month]} ${cursor.year}`;

  function prevMonth() {
    haptic("light");
    setCursor((c) => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  }
  function nextMonth() {
    haptic("light");
    setCursor((c) => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 });
  }
  function goToday() {
    haptic("light");
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate(today);
  }

  function onDropTo(date: string) {
    if (!draggedId) return;
    patchTask(draggedId, { dueDate: date });
    haptic("success");
    setDraggedId(null);
    setDragOver(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Navigation */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <button onClick={prevMonth} className="tappable flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button onClick={nextMonth} className="tappable flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <Icon name="chevron-right" size={18} />
          </button>
          <button onClick={goToday} className="rounded-full bg-[var(--bg-hover)] px-3 py-1 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
            Aujourd&apos;hui
          </button>
        </div>
        <h3 className="text-[15px] font-semibold">{monthLabel}</h3>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-[var(--border)] px-1 pb-2">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)]">
        {weeks.flat().map((date) => {
          const d = parseISODate(date);
          const inMonth = d.getMonth() === cursor.month;
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const dayTasks = tasksByDate.get(date) ?? [];
          const visibleTasks = dayTasks.slice(0, 3);
          const hidden = dayTasks.length - visibleTasks.length;

          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              onDragOver={(e) => {
                if (!draggedId) return;
                e.preventDefault();
                setDragOver(date);
              }}
              onDragLeave={() => setDragOver((c) => (c === date ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                onDropTo(date);
              }}
              className={`group relative flex min-h-[80px] flex-col items-stretch gap-1 bg-[var(--bg-elev)] p-1.5 text-left transition sm:min-h-[100px] ${
                !inMonth ? "opacity-40" : ""
              } ${isSelected ? "ring-2 ring-inset ring-[var(--accent)]" : ""} ${dragOver === date ? "bg-[var(--accent-soft)]" : ""} hover:bg-[var(--bg-hover)]/50`}
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isToday ? "bg-[var(--accent)] text-white" : "text-[var(--text)]"
                }`}>
                  {d.getDate()}
                </span>
                {dayTasks.length > 0 && (
                  <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">{dayTasks.length}</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {visibleTasks.map((t) => {
                  const project = t.projectId ? projectsById.get(t.projectId) : null;
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDraggedId(t.id)}
                      onDragEnd={() => { setDraggedId(null); setDragOver(null); }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTask(t.id);
                      }}
                      className="flex items-center gap-1 truncate rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-left text-[10.5px] text-[var(--text)] cursor-grab active:cursor-grabbing"
                      style={project ? { borderLeft: `2px solid ${project.color}` } : undefined}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                      <span className="truncate">{t.title}</span>
                    </div>
                  );
                })}
                {hidden > 0 && (
                  <div className="text-[10px] text-[var(--text-subtle)]">+{hidden}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day tasks */}
      {selectedDate && (
        <DayPanel
          date={selectedDate}
          tasks={tasksByDate.get(selectedDate) ?? []}
          projectsById={projectsById}
          onOpenTask={onOpenTask}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}

function DayPanel({
  date,
  tasks,
  projectsById,
  onOpenTask,
  onClose,
}: {
  date: string;
  tasks: Task[];
  projectsById: Map<string, { name: string; color: string }>;
  onOpenTask: (id: string) => void;
  onClose: () => void;
}) {
  const d = parseISODate(date);
  const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <h4 className="text-[13.5px] font-semibold capitalize">{label}</h4>
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-[var(--text-muted)]">{tasks.length} tâche{tasks.length !== 1 ? "s" : ""}</span>
          <button onClick={onClose} className="rounded px-1.5 py-0.5 text-[11.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">✕</button>
        </div>
      </div>
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12.5px] text-[var(--text-subtle)]">Aucune tâche ce jour.</div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {tasks.map((t) => {
            const project = t.projectId ? projectsById.get(t.projectId) : null;
            return (
              <button
                key={t.id}
                onClick={() => onOpenTask(t.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg-hover)]/50"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13.5px]">{t.title}</span>
                  {project && (
                    <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: project.color }} />
                      {project.name}
                    </span>
                  )}
                </span>
                {t.dueTime && <span className="text-[11px] text-[var(--text-muted)]">{t.dueTime}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

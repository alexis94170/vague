"use client";

import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useToast } from "../toast";
import { useGoogle } from "../google";
import { PRIORITY_ORDER, Task } from "../lib/types";
import { todayISO } from "../lib/dates";
import { GoogleEvent, eventStart, isAllDay } from "../lib/google-client";
import TaskRow from "./TaskRow";
import EventRow from "./EventRow";
import Icon from "./Icon";

type Props = { onOpenTask: (id: string) => void };

type SectionItem =
  | { kind: "task"; task: Task; sortKey: number }
  | { kind: "event"; event: GoogleEvent; sortKey: number };

type Section = {
  id: string;
  label: string;
  range?: string;
  tone?: string;
  items: SectionItem[];
};

function taskSortKey(t: Task): number {
  if (!t.dueTime) return 99 * 60;
  const [h, m] = t.dueTime.split(":").map(Number);
  return h * 60 + (m || 0);
}

function eventSortKey(e: GoogleEvent): number {
  if (isAllDay(e)) return -1; // all-day first
  const d = eventStart(e);
  return d.getHours() * 60 + d.getMinutes();
}

function sortItems(arr: SectionItem[]): SectionItem[] {
  return [...arr].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    // Tasks come before events at the same time
    if (a.kind !== b.kind) return a.kind === "task" ? -1 : 1;
    if (a.kind === "task" && b.kind === "task") {
      return PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority];
    }
    return 0;
  });
}

function timeSlot(time: string): "morning" | "afternoon" | "evening" {
  const [h] = time.split(":").map(Number);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function eventTimeSlot(e: GoogleEvent): "allday" | "morning" | "afternoon" | "evening" {
  if (isAllDay(e)) return "allday";
  const h = eventStart(e).getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export default function TodayView({ onOpenTask }: Props) {
  const { tasks, restoreTasks, deleteTasks } = useStore();
  const { eventsForDate } = useGoogle();
  const toast = useToast();
  const [showCompleted, setShowCompleted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const today = todayISO();
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const todayEvents = eventsForDate(today);

  const { sections, totals } = useMemo(() => {
    const overdue: Task[] = [];
    const allday: SectionItem[] = [];
    const morning: SectionItem[] = [];
    const afternoon: SectionItem[] = [];
    const evening: SectionItem[] = [];
    const noTime: SectionItem[] = [];
    const doneToday: Task[] = [];

    for (const t of tasks) {
      if (t.deletedAt) continue;
      if (t.done) {
        if (t.doneAt && t.doneAt.slice(0, 10) === today) doneToday.push(t);
        continue;
      }
      if (t.waiting) continue;
      if (t.dueDate && t.dueDate < today) {
        overdue.push(t);
        continue;
      }
      if (t.dueDate === today) {
        const item: SectionItem = { kind: "task", task: t, sortKey: taskSortKey(t) };
        if (!t.dueTime) {
          noTime.push(item);
        } else {
          const slot = timeSlot(t.dueTime);
          if (slot === "morning") morning.push(item);
          else if (slot === "afternoon") afternoon.push(item);
          else evening.push(item);
        }
      }
    }

    // Inject events
    for (const e of todayEvents) {
      const item: SectionItem = { kind: "event", event: e, sortKey: eventSortKey(e) };
      const slot = eventTimeSlot(e);
      if (slot === "allday") allday.push(item);
      else if (slot === "morning") morning.push(item);
      else if (slot === "afternoon") afternoon.push(item);
      else evening.push(item);
    }

    const overdueItems: SectionItem[] = overdue.map((t) => ({ kind: "task", task: t, sortKey: taskSortKey(t) }));

    const sections: Section[] = [
      ...(overdueItems.length ? [{ id: "overdue", label: "En retard", tone: "text-rose-600 dark:text-rose-400", items: sortItems(overdueItems) }] : []),
      ...(allday.length ? [{ id: "allday", label: "Toute la journée", items: sortItems(allday) }] : []),
      { id: "morning", label: "Matin", range: "5h – 12h", items: sortItems(morning) },
      { id: "afternoon", label: "Après-midi", range: "12h – 17h", items: sortItems(afternoon) },
      { id: "evening", label: "Soir", range: "17h – 23h", items: sortItems(evening) },
      { id: "noTime", label: "Sans heure", items: sortItems(noTime) },
    ].filter((s) => s.items.length > 0);

    const taskCount = overdue.length + morning.filter((i) => i.kind === "task").length + afternoon.filter((i) => i.kind === "task").length + evening.filter((i) => i.kind === "task").length + noTime.filter((i) => i.kind === "task").length;
    const allTasksToday = [...overdue, ...morning, ...afternoon, ...evening, ...noTime].filter((i): i is { kind: "task"; task: Task; sortKey: number } => "kind" in i && i.kind === "task" || !("kind" in i)).map((i) => "task" in i ? i.task : (i as Task));

    const totals = {
      total: taskCount,
      done: doneToday.length,
      urgent: allTasksToday.filter((t) => t.priority === "urgent").length,
      overdue: overdue.length,
      estimateMin: allTasksToday.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0),
      doneToday,
      eventCount: todayEvents.length,
    };

    return { sections, totals };
  }, [tasks, today, todayEvents]);

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

  // Empty state — only when no tasks AND no events
  if (totals.total === 0 && totals.done === 0 && totals.eventCount === 0) {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elev)] py-20 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center">
          <svg viewBox="0 0 80 80" className="h-20 w-20 text-[var(--accent)]" fill="none">
            <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="1.5" opacity="0.15" />
            <path
              d="M 16 44 Q 24 38, 32 44 T 48 44 T 64 44"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.5"
            />
            <path
              d="M 16 36 Q 24 30, 32 36 T 48 36 T 64 36"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.8"
            />
          </svg>
        </div>
        <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-[var(--text-strong)]">Une journée tranquille</h3>
        <p className="mt-1.5 mx-auto max-w-xs text-[13.5px] text-[var(--text-muted)]">
          Aucune tâche prévue. Glisse-en une depuis une autre vue, ou utilise <span className="font-medium text-[var(--text)]">Planifier</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* === HERO === */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-elev)]">
        <div className="px-6 pt-6 pb-5 sm:px-7">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">Aujourd'hui</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[44px] font-semibold leading-none tracking-tight text-[var(--text-strong)] num">{totals.total}</span>
                <span className="text-[14px] text-[var(--text-muted)]">
                  {totals.total === 0 ? "Tout est fait" : totals.total > 1 ? "tâches" : "tâche"}
                </span>
              </div>
              {(totals.urgent > 0 || estimateLabel || totals.eventCount > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
                  {totals.urgent > 0 && (
                    <span className="text-rose-600 dark:text-rose-400 font-medium">
                      {totals.urgent} urgente{totals.urgent > 1 ? "s" : ""}
                    </span>
                  )}
                  {estimateLabel && <span>{estimateLabel}</span>}
                  {totals.eventCount > 0 && (
                    <span className="flex items-center gap-1 text-[var(--accent)]">
                      <Icon name="calendar" size={11} />
                      {totals.eventCount} événement{totals.eventCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}
            </div>

            {total > 0 && (
              <div className="text-right">
                <div className={`text-[26px] font-semibold leading-none num ${pct === 100 ? "text-[var(--success)]" : "text-[var(--text-strong)]"}`}>
                  {pct}%
                </div>
                <div className="mt-1 text-[10.5px] uppercase tracking-wider text-[var(--text-subtle)] num">
                  {totals.done}/{total} faites
                </div>
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="mt-5">
              <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--bg-hover)]">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${pct === 100 ? "bg-[var(--success)]" : "bg-[var(--accent)]"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* === Sections === */}
      {sections.map((s) => {
        const isCurrent =
          (s.id === "morning" && nowMins < 12 * 60) ||
          (s.id === "afternoon" && nowMins >= 12 * 60 && nowMins < 17 * 60) ||
          (s.id === "evening" && nowMins >= 17 * 60);
        return (
          <section key={s.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
            <header className="flex items-center justify-between px-5 pt-3.5 pb-2">
              <div className="flex items-baseline gap-2.5">
                <h4 className={`text-[12px] font-semibold tracking-wide ${s.tone ?? "text-[var(--text-strong)]"}`}>
                  {s.label}
                </h4>
                {s.range && (
                  <span className="text-[10.5px] text-[var(--text-subtle)] num">{s.range}</span>
                )}
                {isCurrent && (
                  <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">
                    <span className="h-1 w-1 rounded-full bg-[var(--accent)] anim-pulse-soft" />
                    Maintenant
                  </span>
                )}
              </div>
              <span className="text-[11px] tabular-nums text-[var(--text-subtle)]">
                {s.items.length}
              </span>
            </header>
            <div className="divide-y divide-[var(--border)]/60">
              {s.items.map((it) =>
                it.kind === "task" ? (
                  <TaskRow
                    key={`t-${it.task.id}`}
                    task={it.task}
                    selected={selected.has(it.task.id)}
                    onToggleSelect={toggleSelect}
                    onOpen={onOpenTask}
                  />
                ) : (
                  <EventRow key={`e-${it.event.id}`} event={it.event} />
                )
              )}
            </div>
          </section>
        );
      })}

      {/* === Done today === */}
      {totals.doneToday.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex w-full items-center justify-between px-5 pt-3.5 pb-3 hover:bg-[var(--bg-hover)]/50"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon name="check" size={11} />
              </span>
              <h4 className="text-[12px] font-semibold tracking-wide text-[var(--text-strong)]">
                Terminées
              </h4>
              <span className="text-[11px] tabular-nums text-[var(--text-subtle)]">{totals.doneToday.length}</span>
            </div>
            <Icon
              name="chevron-right"
              size={13}
              className={`text-[var(--text-subtle)] transition-transform ${showCompleted ? "rotate-90" : ""}`}
            />
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

      {/* === Selection bar === */}
      {selected.size > 0 && (
        <div className="sticky bottom-20 z-20 flex items-center justify-between rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-4 py-2 shadow-lg anim-fade-up">
          <span className="text-[12px] font-medium num">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
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

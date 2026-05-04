"use client";

import { useMemo } from "react";
import { useStore } from "../store";
import { useAuth } from "../auth";
import { useGoogle } from "../google";
import { addDays, todayISO, parseISODate } from "../lib/dates";
import { GoogleEvent, eventStart, formatEventTime, isAllDay } from "../lib/google-client";
import Icon from "./Icon";
import SuggestionsPanel from "./SuggestionsPanel";
import ShoppingWidget from "./ShoppingWidget";
import SportsWidget from "./SportsWidget";

type Props = {
  onOpenPlan: () => void;
  onOpenChat: () => void;
  onNavigate: (k: "today" | "all" | "waiting" | "untriaged" | "calendar") => void;
};

export default function Dashboard({ onOpenPlan, onOpenChat, onNavigate }: Props) {
  const { tasks } = useStore();
  const { user } = useAuth();
  const google = useGoogle();
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const todayEvents = google.eventsForDate(today);
  const nextEvent = useMemo(() => {
    const now = new Date();
    return todayEvents
      .filter((e) => !isAllDay(e) && eventStart(e) > now)
      .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime())[0];
  }, [todayEvents]);

  const stats = useMemo(() => {
    let active = 0;
    let doneToday = 0;
    let doneYesterday = 0;
    let plannedToday = 0;
    let urgent = 0;
    let overdue = 0;
    let waiting = 0;
    let weekDone = 0;
    const sevenDaysAgo = addDays(today, -7);

    for (const t of tasks) {
      if (t.deletedAt) continue;
      if (t.done) {
        const d = (t.doneAt ?? "").slice(0, 10);
        if (d === today) doneToday++;
        else if (d === yesterday) doneYesterday++;
        if (d >= sevenDaysAgo) weekDone++;
        continue;
      }
      if (t.waiting) { waiting++; continue; }
      active++;
      if (t.dueDate === today) plannedToday++;
      if (t.dueDate && t.dueDate < today) overdue++;
      if (t.priority === "urgent" && (!t.dueDate || t.dueDate <= today)) urgent++;
    }

    const total = doneToday + plannedToday + overdue;
    const pct = total > 0 ? Math.round((doneToday / total) * 100) : 0;

    // 7-day completions
    const days: Array<{ label: string; count: number; date: string }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      const count = tasks.filter((t) => !t.deletedAt && t.done && t.doneAt && t.doneAt.slice(0, 10) === d).length;
      const dn = parseISODate(d).toLocaleDateString("fr-FR", { weekday: "narrow" }).toUpperCase();
      days.push({ label: dn, count, date: d });
    }
    const maxDay = Math.max(1, ...days.map((d) => d.count));

    return { active, doneToday, doneYesterday, plannedToday, urgent, overdue, waiting, total, pct, weekDone, days, maxDay };
  }, [tasks, today, yesterday]);

  const greeting = getGreeting();
  const firstName = (user?.email ?? "").split("@")[0] ?? "";
  const firstNameCap = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "";
  const todayDate = new Date();
  const dayName = todayDate.toLocaleDateString("fr-FR", { weekday: "long" });
  const dayNum = todayDate.getDate();
  const monthName = todayDate.toLocaleDateString("fr-FR", { month: "long" });

  // Most pertinent action
  const todoCount = stats.plannedToday + stats.overdue;
  const headline = todoCount === 0
    ? (stats.active > 0 ? "Rien de prévu" : "Tout est sous contrôle")
    : `${todoCount} ${todoCount > 1 ? "tâches" : "tâche"}`;
  const headlineSub = todoCount === 0
    ? (stats.active > 0 ? "Profite de ta journée." : "Bravo. Pause méritée.")
    : "à traiter aujourd'hui";

  // Circle stroke for hero progress
  const circ = 2 * Math.PI * 36;
  const dash = stats.total > 0 ? (stats.doneToday / stats.total) * circ : 0;

  return (
    <div className="space-y-4">
      {/* === HERO === */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-elev)] card-glow">
        {/* Decorative wave in corner */}
        <svg
          className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 text-[var(--accent)] opacity-[0.06]"
          viewBox="0 0 200 200"
          fill="none"
        >
          <path
            d="M 0 100 Q 25 70, 50 100 T 100 100 T 150 100 T 200 100"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 0 120 Q 25 90, 50 120 T 100 120 T 150 120 T 200 120"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 0 140 Q 25 110, 50 140 T 100 140 T 150 140 T 200 140"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        </svg>

        <div className="relative px-6 pt-6 pb-5 sm:px-8 sm:pt-8">
          {/* Date pill */}
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-subtle)]">
            <span className="h-1 w-1 rounded-full bg-[var(--accent)] anim-pulse-soft" />
            <span className="capitalize">{dayName}</span>
            <span className="opacity-40">·</span>
            <span className="num">{dayNum}</span>
            <span className="capitalize">{monthName}</span>
          </div>

          {/* Greeting */}
          <h1 className="mt-3 text-[26px] font-semibold leading-[1.1] tracking-tight text-[var(--text-strong)] sm:text-[30px]">
            {greeting}{firstNameCap ? `, ${firstNameCap}` : ""}.
          </h1>

          {/* Headline + ring */}
          <div className="mt-5 flex items-center gap-5">
            <div className="min-w-0 flex-1">
              <div className="text-[42px] font-semibold leading-none tracking-tight text-[var(--text-strong)] sm:text-[48px] num">
                {todoCount === 0 ? "✓" : todoCount}
              </div>
              <div className="mt-1 text-[14px] text-[var(--text-muted)]">
                {headlineSub}
              </div>
            </div>

            {/* Progress ring */}
            {stats.total > 0 && (
              <div className="relative shrink-0">
                <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
                  <circle
                    cx="42"
                    cy="42"
                    r="36"
                    fill="none"
                    stroke="var(--bg-hover)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="42"
                    cy="42"
                    r="36"
                    fill="none"
                    stroke={stats.pct === 100 ? "var(--success)" : "var(--accent)"}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circ}`}
                    style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.2, 0.9, 0.3, 1)" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[15px] font-semibold leading-none text-[var(--text-strong)] num">{stats.pct}%</span>
                  <span className="mt-0.5 text-[9.5px] uppercase tracking-wider text-[var(--text-subtle)] num">{stats.doneToday}/{stats.total}</span>
                </div>
              </div>
            )}
          </div>

          {/* Highlights row */}
          {(stats.urgent > 0 || stats.overdue > 0 || stats.doneToday > 0) && (
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              {stats.urgent > 0 && (
                <button
                  onClick={() => onNavigate("today")}
                  className="flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11.5px] font-medium text-rose-700 transition active:scale-95 dark:text-rose-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  {stats.urgent} urgente{stats.urgent > 1 ? "s" : ""}
                </button>
              )}
              {stats.overdue > 0 && (
                <button
                  onClick={() => onNavigate("today")}
                  className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11.5px] font-medium text-amber-700 transition active:scale-95 dark:text-amber-400"
                >
                  {stats.overdue} en retard
                </button>
              )}
              {stats.doneToday > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--accent)]">
                  <Icon name="check" size={11} />
                  {stats.doneToday} faite{stats.doneToday > 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 grid grid-cols-3 gap-2">
            <button
              onClick={() => onNavigate("today")}
              className="group flex items-center justify-center gap-1.5 rounded-2xl bg-[var(--accent)] px-3 py-3 text-[13px] font-semibold text-[var(--accent-fg)] shadow-sm transition active:scale-[0.97]"
            >
              Ma journée
              <Icon name="chevron-right" size={13} className="transition group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={onOpenPlan}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-[13px] font-medium text-[var(--text)] transition hover:bg-[var(--bg-hover)] active:scale-[0.97]"
            >
              <Icon name="sparkles" size={12} />
              Planifier
            </button>
            <button
              onClick={onOpenChat}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-[13px] font-medium text-[var(--text)] transition hover:bg-[var(--bg-hover)] active:scale-[0.97]"
            >
              <Icon name="sparkles" size={12} />
              Assistant
            </button>
          </div>
        </div>
      </section>

      {/* AI suggestions */}
      <SuggestionsPanel />

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard
          label="En retard"
          value={stats.overdue}
          tone={stats.overdue > 0 ? "danger" : "neutral"}
          onClick={() => onNavigate("today")}
        />
        <StatCard
          label="Aujourd'hui"
          value={stats.plannedToday}
          tone={stats.plannedToday > 0 ? "warning" : "neutral"}
          onClick={() => onNavigate("today")}
        />
        <StatCard
          label="À trier"
          value={tasks.filter((t) => !t.done && !t.waiting && !t.deletedAt && !t.projectId).length}
          tone="neutral"
          onClick={() => onNavigate("untriaged")}
        />
        <StatCard
          label="En attente"
          value={stats.waiting}
          tone="neutral"
          onClick={() => onNavigate("waiting")}
        />
      </div>

      {/* Today's events (if Google connected) */}
      {google.status?.connected && todayEvents.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
          <header className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon name="calendar" size={13} />
              </span>
              <div>
                <h4 className="text-[13.5px] font-semibold tracking-tight text-[var(--text-strong)]">
                  Agenda du jour
                </h4>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {todayEvents.length} événement{todayEvents.length > 1 ? "s" : ""}
                  {nextEvent && (
                    <>
                      {" · prochain à "}
                      <span className="text-[var(--accent)] font-medium">
                        {eventStart(nextEvent).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </header>
          <div className="divide-y divide-[var(--border)]/60">
            {todayEvents.slice(0, 4).map((e) => (
              <DashboardEventRow key={e.id} event={e} />
            ))}
            {todayEvents.length > 4 && (
              <button
                onClick={() => onNavigate("today")}
                className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]/40"
              >
                Voir les {todayEvents.length - 4} autres
                <Icon name="chevron-right" size={11} />
              </button>
            )}
          </div>
        </section>
      )}

      {/* Widgets */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ShoppingWidget />
        <SportsWidget />
      </div>

      {/* Activity */}
      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-[13.5px] font-semibold text-[var(--text)]">Activité de la semaine</span>
            <span className="text-[11.5px] text-[var(--text-muted)] num">
              {stats.weekDone} faite{stats.weekDone > 1 ? "s" : ""}
            </span>
          </div>
          <Icon name="chevron-right" size={14} className="text-[var(--text-subtle)] transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-[var(--border)] px-5 py-5">
          {/* 7-day chart, full width */}
          <div className="rounded-2xl bg-[var(--bg)] p-5">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">7 derniers jours</div>
                <div className="mt-0.5 text-[22px] font-semibold leading-tight text-[var(--text-strong)] num">
                  {stats.weekDone}
                  <span className="ml-1 text-[12px] font-normal text-[var(--text-muted)]">
                    tâche{stats.weekDone > 1 ? "s" : ""} terminée{stats.weekDone > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              {stats.doneYesterday > 0 && (
                <div className="text-right text-[11px] text-[var(--text-muted)]">
                  Hier · <span className="font-medium text-[var(--text)] num">{stats.doneYesterday}</span>
                </div>
              )}
            </div>
            <div className="flex h-20 items-end gap-2">
              {stats.days.map((d, i) => {
                const isToday = d.date === today;
                const h = d.count > 0 ? Math.max(10, (d.count / stats.maxDay) * 100) : 4;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-md transition-all ${
                          d.count === 0
                            ? "bg-[var(--bg-hover)]"
                            : isToday
                              ? "bg-[var(--accent)]"
                              : "bg-[var(--accent)]/40"
                        }`}
                        style={{ height: `${h}%` }}
                        title={d.count > 0 ? `${d.count} tâche${d.count > 1 ? "s" : ""}` : "Aucune tâche"}
                      />
                    </div>
                    <span className={`text-[10px] num ${isToday ? "font-semibold text-[var(--accent)]" : "text-[var(--text-subtle)]"}`}>
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "neutral";
  onClick: () => void;
}) {
  const valueClass =
    tone === "danger" && value > 0 ? "text-rose-600 dark:text-rose-400" :
    tone === "warning" && value > 0 ? "text-amber-600 dark:text-amber-400" :
    "text-[var(--text-strong)]";

  return (
    <button
      onClick={onClick}
      className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] active:scale-[0.98]"
    >
      <div className={`text-[26px] font-semibold leading-none tracking-tight num ${valueClass}`}>
        {value}
      </div>
      <div className="mt-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
    </button>
  );
}

function DashboardEventRow({ event }: { event: GoogleEvent }) {
  const allDay = isAllDay(event);
  const start = !allDay ? eventStart(event) : null;
  return (
    <a
      href={event.htmlLink}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--bg-hover)]/40"
    >
      <span className="flex w-12 shrink-0 flex-col items-end text-right">
        {allDay ? (
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
            Toute<br />la journée
          </span>
        ) : (
          <>
            <span className="text-[13px] font-semibold leading-none text-[var(--text-strong)] num">
              {start!.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="mt-0.5 text-[10px] text-[var(--text-subtle)]">
              {formatEventTime(event).split(" – ")[1]}
            </span>
          </>
        )}
      </span>
      <span className="block h-9 w-[2px] shrink-0 rounded-full bg-[var(--accent)]/50" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-[var(--text-strong)]">
          {event.summary || "(Sans titre)"}
        </div>
        {event.location && (
          <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
            📍 {event.location}
          </div>
        )}
      </div>
    </a>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

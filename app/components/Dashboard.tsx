"use client";

import { useMemo } from "react";
import { useStore } from "../store";
import { useAuth } from "../auth";
import { addDays, todayISO, parseISODate } from "../lib/dates";
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
  const today = todayISO();
  const yesterday = addDays(today, -1);

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
  const todayLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const todayLabelCap = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);

  // Headline
  let headline = `${stats.plannedToday + stats.overdue} tâche${stats.plannedToday + stats.overdue > 1 ? "s" : ""} pour aujourd'hui`;
  if (stats.plannedToday + stats.overdue === 0) {
    headline = stats.active > 0 ? "Rien de prévu aujourd'hui" : "Tout est sous contrôle.";
  }

  return (
    <div className="space-y-3">
      {/* HERO — single, generous, calm */}
      <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elev)] px-6 py-7">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-[12px] font-medium text-[var(--text-muted)]">{todayLabelCap}</div>
            <h2 className="mt-1 text-[24px] font-semibold leading-tight tracking-tight">
              {greeting}{firstName ? `, ${firstName}` : ""}.
            </h2>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">{headline}</p>
          </div>
        </div>

        {stats.total > 0 && (
          <div className="mt-5 space-y-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-bold tabular-nums leading-none text-[var(--text)]">{stats.doneToday}</span>
              <span className="text-[14px] text-[var(--text-muted)]">/ {stats.total} faites</span>
              {stats.urgent > 0 && (
                <span className="ml-auto rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  {stats.urgent} urgente{stats.urgent > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="relative h-1 overflow-hidden rounded-full bg-[var(--bg-hover)]">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${stats.pct === 100 ? "bg-emerald-500" : "bg-[var(--accent)]"}`}
                style={{ width: `${stats.pct}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => onNavigate("today")}
            className="flex items-center gap-1.5 rounded-full bg-[var(--text)] px-4 py-2 text-[12.5px] font-medium text-[var(--bg)] transition active:scale-95"
          >
            Voir ma journée
            <Icon name="chevron-right" size={12} />
          </button>
          <button
            onClick={onOpenPlan}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-transparent px-4 py-2 text-[12.5px] font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <Icon name="sparkles" size={12} />
            Planifier
          </button>
          <button
            onClick={onOpenChat}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-transparent px-4 py-2 text-[12.5px] font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <Icon name="sparkles" size={12} />
            Assistant
          </button>
        </div>
      </section>

      {/* AI suggestions (only if user wants them — already collapsible) */}
      <SuggestionsPanel />

      {/* Compact widgets */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ShoppingWidget />
        <SportsWidget />
      </div>

      {/* Activity — collapsed by default */}
      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-[13.5px] font-semibold text-[var(--text)]">Activité de la semaine</span>
            <span className="text-[11.5px] text-[var(--text-muted)]">{stats.weekDone} faite{stats.weekDone > 1 ? "s" : ""}</span>
          </div>
          <Icon name="chevron-right" size={14} className="text-[var(--text-subtle)] transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-[var(--border)] px-5 py-5">
          {/* Mini stats */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              onClick={() => onNavigate("today")}
              className="rounded-xl bg-[var(--bg)] p-3 text-left transition hover:bg-[var(--bg-hover)]"
            >
              <div className="text-[20px] font-bold tabular-nums leading-tight text-rose-600 dark:text-rose-400">{stats.overdue}</div>
              <div className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">En retard</div>
            </button>
            <button
              onClick={() => onNavigate("today")}
              className="rounded-xl bg-[var(--bg)] p-3 text-left transition hover:bg-[var(--bg-hover)]"
            >
              <div className="text-[20px] font-bold tabular-nums leading-tight text-amber-600 dark:text-amber-400">{stats.plannedToday}</div>
              <div className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Aujourd&apos;hui</div>
            </button>
            <button
              onClick={() => onNavigate("untriaged")}
              className="rounded-xl bg-[var(--bg)] p-3 text-left transition hover:bg-[var(--bg-hover)]"
            >
              <div className="text-[20px] font-bold tabular-nums leading-tight text-[var(--text)]">{tasks.filter((t) => !t.done && !t.waiting && !t.deletedAt && !t.projectId).length}</div>
              <div className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">À trier</div>
            </button>
            <button
              onClick={() => onNavigate("waiting")}
              className="rounded-xl bg-[var(--bg)] p-3 text-left transition hover:bg-[var(--bg-hover)]"
            >
              <div className="text-[20px] font-bold tabular-nums leading-tight text-yellow-600 dark:text-yellow-400">{stats.waiting}</div>
              <div className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">En attente</div>
            </button>
          </div>

          {/* 7-day chart */}
          <div className="rounded-xl bg-[var(--bg)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[12.5px] font-semibold">7 derniers jours</h4>
              <span className="text-[11px] text-[var(--text-muted)]">{stats.weekDone} faite{stats.weekDone > 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-end gap-2 h-16">
              {stats.days.map((d, i) => {
                const isToday = d.date === today;
                const h = d.count > 0 ? Math.max(8, (d.count / stats.maxDay) * 100) : 4;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          d.count === 0 ? "bg-[var(--bg-hover)]" : isToday ? "bg-[var(--accent)]" : "bg-[var(--accent)]/50"
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className={`text-[9.5px] tabular-nums ${isToday ? "font-bold text-[var(--accent)]" : "text-[var(--text-subtle)]"}`}>
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

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

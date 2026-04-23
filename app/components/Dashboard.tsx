"use client";

import { useMemo } from "react";
import { useStore } from "../store";
import { useAuth } from "../auth";
import { addDays, todayISO, diffDays, parseISODate } from "../lib/dates";
import { Task } from "../lib/types";
import Icon from "./Icon";
import SuggestionsPanel from "./SuggestionsPanel";

type Props = {
  onOpenPlan: () => void;
  onOpenChat: () => void;
  onNavigate: (k: "today" | "all" | "waiting" | "untriaged" | "calendar") => void;
};

export default function Dashboard({ onOpenPlan, onOpenChat, onNavigate }: Props) {
  const { tasks, projects } = useStore();
  const { user } = useAuth();
  const today = todayISO();

  const stats = useMemo(() => {
    const active = tasks.filter((t) => !t.done && !t.waiting);
    const waiting = tasks.filter((t) => !t.done && t.waiting);
    const done = tasks.filter((t) => t.done);
    const overdue = active.filter((t) => t.dueDate && t.dueDate < today);
    const todayTasks = active.filter((t) => t.dueDate === today);
    const thisWeekEnd = addDays(today, 7);
    const thisWeek = active.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= thisWeekEnd);
    const byPriority = {
      urgent: active.filter((t) => t.priority === "urgent").length,
      high: active.filter((t) => t.priority === "high").length,
      medium: active.filter((t) => t.priority === "medium").length,
      low: active.filter((t) => t.priority === "low").length,
      none: active.filter((t) => t.priority === "none").length,
    };

    // Completions over last 7 days
    const last7Days: Array<{ date: string; label: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      const label = parseISODate(d).toLocaleDateString("fr-FR", { weekday: "short" });
      const count = done.filter((t) => t.doneAt && t.doneAt.slice(0, 10) === d).length;
      last7Days.push({ date: d, label: label.charAt(0).toUpperCase() + label.slice(1), count });
    }
    const weekDone = last7Days.reduce((sum, d) => sum + d.count, 0);
    const maxDoneDay = Math.max(1, ...last7Days.map((d) => d.count));

    // Streak: days in a row with at least one done task ending today
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = addDays(today, -i);
      const hasDone = done.some((t) => t.doneAt && t.doneAt.slice(0, 10) === d);
      if (hasDone) streak++;
      else if (i === 0) continue; // don't break if today still empty
      else break;
    }

    // Top 5 projects by active task count
    const projectCounts = new Map<string, number>();
    active.forEach((t) => {
      if (t.projectId) projectCounts.set(t.projectId, (projectCounts.get(t.projectId) ?? 0) + 1);
    });
    const topProjects = Array.from(projectCounts.entries())
      .map(([id, count]) => {
        const p = projects.find((pp) => pp.id === id);
        return p ? { id, name: p.name, color: p.color, count } : null;
      })
      .filter((p): p is { id: string; name: string; color: string; count: number } => !!p)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const maxProjectCount = Math.max(1, ...topProjects.map((p) => p.count));

    return {
      activeCount: active.length,
      waitingCount: waiting.length,
      doneCount: done.length,
      overdueCount: overdue.length,
      todayCount: todayTasks.length,
      thisWeekCount: thisWeek.length,
      byPriority,
      last7Days,
      weekDone,
      maxDoneDay,
      streak,
      topProjects,
      maxProjectCount,
    };
  }, [tasks, projects, today]);

  const greeting = getGreeting();
  const firstName = (user?.email ?? "").split("@")[0] ?? "";

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--accent-soft-2)] to-[var(--accent-soft)] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[13px] font-medium text-[var(--accent)]">
              {greeting}{firstName ? ` ${firstName}` : ""}.
            </div>
            <h2 className="mt-1 text-[20px] font-semibold leading-tight text-[var(--text)] sm:text-[24px]">
              {stats.todayCount === 0 ? (
                stats.overdueCount > 0 ? `Tu as ${stats.overdueCount} tâche${stats.overdueCount > 1 ? "s" : ""} en retard.` : "Rien d'urgent aujourd'hui."
              ) : (
                `${stats.todayCount} tâche${stats.todayCount > 1 ? "s" : ""} pour aujourd'hui.`
              )}
            </h2>
            <p className="mt-2 text-[13px] text-[var(--text-muted)]">
              {stats.activeCount} active{stats.activeCount !== 1 ? "s" : ""} · {stats.thisWeekCount} à venir cette semaine · {stats.weekDone} terminée{stats.weekDone !== 1 ? "s" : ""} en 7 jours
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={onOpenPlan}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-[12.5px] font-medium text-white transition active:scale-95"
          >
            <Icon name="sparkles" size={13} />
            Planifier ma journée
          </button>
          <button
            onClick={onOpenChat}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elev)] px-3 py-2 text-[12.5px] font-medium text-[var(--text)] transition active:scale-95"
          >
            <Icon name="sparkles" size={13} />
            Assistant
          </button>
          <button
            onClick={() => onNavigate("today")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elev)] px-3 py-2 text-[12.5px] font-medium text-[var(--text)] transition active:scale-95"
          >
            <Icon name="sun" size={13} />
            Aujourd&apos;hui
          </button>
        </div>
      </div>

      {/* AI Suggestions */}
      <SuggestionsPanel />

      {/* Key stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="En retard" value={stats.overdueCount} tone="rose" onClick={() => onNavigate("today")} />
        <StatCard label="Aujourd'hui" value={stats.todayCount} tone="amber" onClick={() => onNavigate("today")} />
        <StatCard label="À trier" value={tasks.filter((t) => !t.done && !t.waiting && !t.projectId).length} tone="slate" onClick={() => onNavigate("untriaged")} />
        <StatCard label="En attente" value={stats.waitingCount} tone="yellow" onClick={() => onNavigate("waiting")} />
      </div>

      {/* Week completions chart */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold">7 derniers jours</h3>
            <p className="text-[11.5px] text-[var(--text-muted)]">{stats.weekDone} tâche{stats.weekDone !== 1 ? "s" : ""} terminée{stats.weekDone !== 1 ? "s" : ""}{stats.streak > 0 && ` · série de ${stats.streak} jour${stats.streak > 1 ? "s" : ""}`}</p>
          </div>
          {stats.streak >= 3 && (
            <span className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-600 ring-1 ring-inset ring-orange-500/20 dark:text-orange-300">
              🔥 {stats.streak}
            </span>
          )}
        </div>
        <div className="flex items-end gap-2 h-28">
          {stats.last7Days.map((d, i) => {
            const isToday = d.date === today;
            const height = (d.count / stats.maxDoneDay) * 100;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      d.count === 0 ? "bg-[var(--bg-hover)]" : isToday ? "bg-[var(--accent)]" : "bg-[var(--accent)]/60"
                    }`}
                    style={{ height: d.count === 0 ? "4px" : `${Math.max(4, height)}%` }}
                    title={`${d.count} tâche${d.count !== 1 ? "s" : ""}`}
                  />
                </div>
                <span className={`text-[10.5px] tabular-nums ${isToday ? "font-semibold text-[var(--accent)]" : "text-[var(--text-subtle)]"}`}>
                  {d.count}
                </span>
                <span className={`text-[10px] ${isToday ? "font-medium text-[var(--text)]" : "text-[var(--text-subtle)]"}`}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Priority breakdown */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-5">
          <h3 className="mb-3 text-[14px] font-semibold">Par priorité</h3>
          <div className="space-y-2">
            {([
              { k: "urgent", label: "Urgente", color: "bg-rose-500" },
              { k: "high", label: "Haute", color: "bg-orange-500" },
              { k: "medium", label: "Moyenne", color: "bg-amber-500" },
              { k: "low", label: "Basse", color: "bg-sky-500" },
              { k: "none", label: "Aucune", color: "bg-[var(--text-subtle)]/40" },
            ] as const).map((row) => {
              const count = stats.byPriority[row.k];
              const pct = stats.activeCount > 0 ? (count / stats.activeCount) * 100 : 0;
              return (
                <div key={row.k} className="flex items-center gap-2">
                  <span className="flex items-center gap-2 w-20 text-[11.5px] text-[var(--text-muted)]">
                    <span className={`h-2 w-2 rounded-full ${row.color}`} />
                    {row.label}
                  </span>
                  <div className="relative flex-1 h-2 overflow-hidden rounded-full bg-[var(--bg-hover)]">
                    <div className={`h-full ${row.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right text-[11.5px] tabular-nums text-[var(--text-muted)]">{count}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top projects */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-5">
          <h3 className="mb-3 text-[14px] font-semibold">Projets les plus actifs</h3>
          {stats.topProjects.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-muted)]">Aucun projet actif.</p>
          ) : (
            <div className="space-y-2">
              {stats.topProjects.map((p) => {
                const pct = (p.count / stats.maxProjectCount) * 100;
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="flex items-center gap-2 w-28 min-w-0 text-[11.5px] text-[var(--text-muted)]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <div className="relative flex-1 h-2 overflow-hidden rounded-full bg-[var(--bg-hover)]">
                      <div className="h-full" style={{ width: `${pct}%`, background: p.color }} />
                    </div>
                    <span className="w-6 text-right text-[11.5px] tabular-nums text-[var(--text-muted)]">{p.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
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
  tone: "rose" | "amber" | "slate" | "yellow";
  onClick: () => void;
}) {
  const tones: Record<string, string> = {
    rose: "text-rose-600 dark:text-rose-300",
    amber: "text-amber-600 dark:text-amber-300",
    slate: "text-[var(--text)]",
    yellow: "text-yellow-600 dark:text-yellow-300",
  };
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-0.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-4 text-left transition active:scale-[0.98] hover:border-[var(--border-strong)]"
    >
      <span className="text-[11.5px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      <span className={`text-[28px] font-bold tabular-nums leading-none ${tones[tone]}`}>{value}</span>
    </button>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

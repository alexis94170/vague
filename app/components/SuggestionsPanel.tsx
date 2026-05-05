"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { useGoogle } from "../google";
import { aiSuggest, Suggestion, SuggestResult, WeekAgendaDay } from "../lib/ai-client";
import { addDays, todayISO } from "../lib/dates";
import { haptic } from "../lib/haptics";
import { isAllDay, eventStart, eventEnd } from "../lib/google-client";
import { workDayWindow, findFreeSlots } from "../lib/calendar-utils";
import Icon, { IconName } from "./Icon";

const STORAGE_KEY = "vague:suggestions:v1";

type CachedSuggestions = {
  date: string;
  result: SuggestResult;
};

const KIND_META: Record<Suggestion["kind"], { icon: IconName; color: string; label: string }> = {
  focus: { icon: "flag", color: "text-rose-500", label: "À traiter" },
  reschedule: { icon: "calendar", color: "text-amber-500", label: "À dater" },
  followup: { icon: "repeat", color: "text-sky-500", label: "À relancer" },
  cleanup: { icon: "trash", color: "text-zinc-500", label: "À nettoyer" },
  waiting: { icon: "pause", color: "text-amber-500", label: "En attente" },
  insight: { icon: "sparkles", color: "text-[var(--accent)]", label: "Insight" },
  workload: { icon: "clock", color: "text-orange-500", label: "Charge" },
  snoozed: { icon: "repeat", color: "text-rose-500", label: "Reportée" },
};

const ACTION_LABEL: Record<Suggestion["action"], string> = {
  mark_today: "Aujourd'hui",
  snooze_tomorrow: "Demain",
  snooze_week: "+1 semaine",
  mark_waiting: "En attente",
  delete: "Supprimer",
  none: "Ok",
};

export default function SuggestionsPanel() {
  const { tasks, projects, patchTasks, deleteTasks } = useStore();
  const { events, isConnected: googleConnected } = useGoogle();
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  // Compute week agenda summary for the AI
  const weekAgenda = useMemo<WeekAgendaDay[]>(() => {
    if (!googleConnected) return [];
    const today = todayISO();
    const out: WeekAgendaDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const dayEvents = events.filter((e) => {
        const start = eventStart(e);
        const y = start.getFullYear();
        const m = String(start.getMonth() + 1).padStart(2, "0");
        const d = String(start.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}` === date;
      });
      const totalMinutes = dayEvents.reduce((sum, e) => {
        if (isAllDay(e)) return sum;
        return sum + Math.round((eventEnd(e).getTime() - eventStart(e).getTime()) / 60_000);
      }, 0);
      const win = workDayWindow(date);
      const slots = findFreeSlots(dayEvents, win.start, win.end, 15);
      const freeMinutes = slots.reduce((sum, s) => sum + s.minutes, 0);
      out.push({ date, events: dayEvents.length, totalMinutes, freeMinutes });
    }
    return out;
  }, [events, googleConnected]);

  useEffect(() => {
    // Load cached suggestions for today
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as CachedSuggestions;
        if (cached.date === todayISO() && cached.result) {
          setResult(cached.result);
        }
      }
    } catch {}
  }, []);

  async function generate() {
    if (tasks.filter((t) => !t.done).length < 3) {
      setError("Ajoute au moins 3 tâches avant.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await aiSuggest(tasks, projects, weekAgenda.length > 0 ? weekAgenda : undefined);
      setResult(r);
      setDismissed(new Set());
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayISO(), result: r }));
      haptic("success");
    } catch (e) {
      setError((e as Error).message);
      haptic("warning");
    } finally {
      setLoading(false);
    }
  }

  function applyAction(s: Suggestion, idx: number) {
    if (s.taskIds.length === 0 || s.action === "none") {
      dismiss(idx);
      return;
    }
    switch (s.action) {
      case "mark_today":
        patchTasks(s.taskIds, { dueDate: todayISO() });
        break;
      case "snooze_tomorrow":
        patchTasks(s.taskIds, { dueDate: addDays(todayISO(), 1) });
        break;
      case "snooze_week":
        patchTasks(s.taskIds, { dueDate: addDays(todayISO(), 7) });
        break;
      case "mark_waiting":
        patchTasks(s.taskIds, { waiting: true });
        break;
      case "delete":
        if (!confirm(`Supprimer ${s.taskIds.length} tâche(s) ?`)) return;
        deleteTasks(s.taskIds);
        break;
    }
    haptic("success");
    dismiss(idx);
  }

  function dismiss(idx: number) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  }

  const visible = result?.suggestions.filter((_, i) => !dismissed.has(i)) ?? [];

  if (!result && !loading && !error) {
    return (
      <button
        onClick={generate}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-transparent px-4 py-3 text-[13px] font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] active:scale-[0.98]"
      >
        <Icon name="sparkles" size={14} />
        Demander des suggestions à l&apos;IA
      </button>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-fg)]">
            <Icon name="sparkles" size={11} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">Suggestions</div>
            {result?.headline && (
              <div className="truncate text-[11.5px] text-[var(--text-muted)]">{result.headline}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={generate}
            disabled={loading}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            title="Régénérer"
          >
            {loading ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
            ) : (
              <Icon name="repeat" size={14} />
            )}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          >
            <Icon name={collapsed ? "chevron-right" : "x"} size={14} />
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="divide-y divide-[var(--border)]">
          {error && (
            <div className="px-4 py-3 text-[12.5px] text-rose-600">{error}</div>
          )}
          {loading && !result && (
            <div className="flex items-center gap-2 px-4 py-4 text-[12.5px] text-[var(--text-muted)]">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
              Claude réfléchit…
            </div>
          )}
          {visible.length === 0 && result && !loading && (
            <div className="px-4 py-4 text-center text-[12.5px] text-[var(--text-muted)]">
              Tu as tout traité. Beau travail 🌊
            </div>
          )}
          {visible.map((s) => {
            const idx = result!.suggestions.indexOf(s);
            const meta = KIND_META[s.kind];
            const tasksInSug = s.taskIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
            return (
              <div key={idx} className="px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <span className={`mt-0.5 ${meta.color}`}>
                    <Icon name={meta.icon} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-snug text-[var(--text)]">{s.title}</div>
                    {s.detail && (
                      <div className="mt-0.5 text-[11.5px] italic text-[var(--text-muted)]">{s.detail}</div>
                    )}
                    {tasksInSug.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tasksInSug.slice(0, 5).map((t) => (
                          <span key={t.id} className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-muted)]">
                            {t.title.length > 30 ? t.title.slice(0, 30) + "…" : t.title}
                          </span>
                        ))}
                        {tasksInSug.length > 5 && (
                          <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-muted)]">
                            +{tasksInSug.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 pl-6">
                  {s.action !== "none" && (
                    <button
                      onClick={() => applyAction(s, idx)}
                      className="rounded-full bg-[var(--accent)] px-3 py-1 text-[11.5px] font-medium text-[var(--accent-fg)] transition active:scale-95"
                    >
                      {ACTION_LABEL[s.action]}
                    </button>
                  )}
                  <button
                    onClick={() => dismiss(idx)}
                    className="rounded-md px-2 py-1 text-[11.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    Ignorer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

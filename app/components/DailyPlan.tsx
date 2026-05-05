"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { useGoogle } from "../google";
import { useToast } from "../toast";
import { aiPlan, PlanResult } from "../lib/ai-client";
import { todayISO } from "../lib/dates";
import { autoSchedule, clampToNow, findFreeSlots, formatHourMinute, formatDuration, workDayWindow } from "../lib/calendar-utils";
import { haptic } from "../lib/haptics";
import { Task } from "../lib/types";
import Icon from "./Icon";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function DailyPlan({ open, onClose }: Props) {
  const { tasks, projects, patchTasks, patchTask } = useStore();
  const { eventsForDate, isConnected } = useGoogle();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableMinutes, setAvailableMinutes] = useState<number | undefined>();
  const [focus, setFocus] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const today = todayISO();
  const todayEvents = isConnected ? eventsForDate(today) : [];

  // Free slots for today
  const freeSlots = useMemo(() => {
    if (!isConnected) return [];
    const baseWindow = workDayWindow(today);
    const win = clampToNow(baseWindow, today);
    return findFreeSlots(todayEvents, win.start, win.end, 15);
  }, [todayEvents, today, isConnected]);
  const totalFreeMinutes = freeSlots.reduce((sum, s) => sum + s.minutes, 0);

  const selectedTasks = useMemo<Task[]>(() => {
    if (!result) return [];
    return result.selectedIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t);
  }, [result, tasks]);

  useEffect(() => {
    if (open && !result && !loading) {
      run();
    }
    if (!open) {
      setResult(null);
      setError(null);
      setChecked(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (result) setChecked(new Set(result.selectedIds));
  }, [result]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      // Build calendar context for the AI
      const events = todayEvents.map((e) => {
        const start = new Date(e.start.dateTime ?? e.start.date ?? 0);
        const end = new Date(e.end.dateTime ?? e.end.date ?? 0);
        const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        return {
          summary: e.summary || "(Sans titre)",
          start: fmt(start),
          end: fmt(end),
          calendar: e.__calendarName ?? undefined,
        };
      });
      const slotsBrief = freeSlots.map((s) => ({
        start: formatHourMinute(s.start),
        end: formatHourMinute(s.end),
        minutes: s.minutes,
      }));
      const baseWin = workDayWindow(today);
      const win = clampToNow(baseWin, today);
      const r = await aiPlan(tasks, projects, {
        availableMinutes,
        focus: focus.trim() || undefined,
        events: isConnected ? events : undefined,
        freeSlots: isConnected ? slotsBrief : undefined,
        workWindow: { start: formatHourMinute(win.start), end: formatHourMinute(win.end) },
      });
      setResult(r);
      haptic("success");
    } catch (e) {
      setError((e as Error).message);
      haptic("warning");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Apply only the date — keep current behavior
  function applyDateOnly() {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    patchTasks(ids, { dueDate: todayISO() });
    haptic("success");
    toast.show({ message: `${ids.length} tâche(s) prévue(s) aujourd'hui 🌊` });
    onClose();
  }

  // Apply BOTH date and AI-suggested time per task
  function applyWithSchedule() {
    if (!result) return;
    const scheduledTasks = result.schedule.filter((s) => checked.has(s.taskId));
    if (scheduledTasks.length === 0) return;

    let withTime = 0;
    let withoutTime = 0;
    for (const s of scheduledTasks) {
      patchTask(s.taskId, {
        dueDate: today,
        ...(s.suggestedTime ? { dueTime: s.suggestedTime, estimateMinutes: s.durationMinutes || undefined } : {}),
      });
      if (s.suggestedTime) withTime++;
      else withoutTime++;
    }
    haptic("success");
    if (withoutTime > 0) {
      toast.show({ message: `${withTime} planifiées · ${withoutTime} sans heure 🌊` });
    } else {
      toast.show({ message: `${withTime} tâche(s) planifiée(s) avec horaire 🌊` });
    }
    onClose();
  }


  if (!open) return null;

  const projectsById = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 anim-fade-in sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-[var(--bg-elev)] shadow-2xl anim-scale-in sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl sm:border sm:border-[var(--border)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 safe-top">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
              <Icon name="sparkles" size={14} />
            </span>
            <h2 className="text-[17px] font-semibold">Planifier ma journée</h2>
          </div>
          <button onClick={onClose} className="tappable flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!result && (
            <div className="space-y-3">
              <div className="text-[13px] text-[var(--text-muted)]">
                L&apos;IA va choisir 5-7 tâches à traiter aujourd&apos;hui parmi tes tâches actives.
                Tu peux lui donner un focus ou un budget de temps.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Temps dispo (min)</span>
                  <input
                    type="number"
                    min={30}
                    step={30}
                    value={availableMinutes ?? ""}
                    onChange={(e) => setAvailableMinutes(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="ex: 240"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Focus</span>
                  <input
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    placeholder="ex: Indiana Café, admin…"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
                  />
                </label>
              </div>
              {loading ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] py-6 text-[13px] text-[var(--text-muted)]">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
                  L&apos;IA réfléchit…
                </div>
              ) : (
                <button
                  onClick={run}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-3 text-[14px] font-medium text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
                >
                  <Icon name="sparkles" size={16} />
                  Générer le plan du jour
                </button>
              )}
              {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300">{error}</div>}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">Pourquoi ce plan</div>
                <p className="text-[13px] leading-relaxed text-[var(--text)]">{result.reasoning}</p>
              </div>

              {/* Free slots from Google Agenda */}
              {isConnected && freeSlots.length > 0 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      Créneaux libres aujourd&apos;hui
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">{formatDuration(totalFreeMinutes)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {freeSlots.map((slot, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-[11.5px] text-[var(--text-muted)]"
                      >
                        <span className="font-medium text-[var(--text)]">{formatHourMinute(slot.start)}</span>
                        <span className="text-[var(--text-subtle)]">·</span>
                        {formatDuration(slot.minutes)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {isConnected && freeSlots.length === 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                  Ton agenda est plein aujourd&apos;hui. Pas de créneau libre détecté.
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    Sélection ({checked.size}/{selectedTasks.length})
                  </span>
                  <button
                    onClick={() => {
                      setResult(null);
                      setChecked(new Set());
                    }}
                    className="text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    Régénérer
                  </button>
                </div>
                {(result.schedule ?? []).map((s) => {
                  const t = tasks.find((x) => x.id === s.taskId);
                  if (!t) return null;
                  const project = t.projectId ? projectsById.get(t.projectId) : null;
                  const isChecked = checked.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t.id)}
                      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                        isChecked ? "border-[var(--accent)]/30 bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--bg)]"
                      }`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-[1.5px] ${
                        isChecked ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)]"
                      }`}>
                        {isChecked && <Icon name="check" size={12} className="text-[var(--accent-fg)]" />}
                      </span>
                      {/* Time block */}
                      {s.suggestedTime && (
                        <span className="mt-0.5 flex w-14 shrink-0 flex-col items-end text-right">
                          <span className="text-[12.5px] font-semibold tabular-nums leading-tight text-[var(--accent)]">
                            {s.suggestedTime}
                          </span>
                          <span className="text-[10px] text-[var(--text-subtle)]">
                            {s.durationMinutes}min
                          </span>
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="break-words text-[13.5px] font-medium leading-snug text-[var(--text)]">{t.title}</span>
                        {/* Per-task AI reasoning */}
                        {s.reasoning && (
                          <span className="text-[11px] italic text-[var(--text-muted)]">
                            ✦ {s.reasoning}
                          </span>
                        )}
                        <span className="flex items-center gap-2 text-[11.5px] text-[var(--text-muted)]">
                          {t.priority !== "none" && (
                            <span className={
                              t.priority === "urgent" ? "text-rose-500 font-medium" :
                              t.priority === "high" ? "text-orange-500 font-medium" :
                              t.priority === "medium" ? "text-amber-500" : "text-sky-500"
                            }>
                              {t.priority === "urgent" ? "Urgente" : t.priority === "high" ? "Haute" : t.priority === "medium" ? "Moyenne" : "Basse"}
                            </span>
                          )}
                          {project && (
                            <span className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: project.color }} />
                              {project.name}
                            </span>
                          )}
                          {t.estimateMinutes && <span>⏱ {t.estimateMinutes}min</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-5 py-3 safe-bottom">
            <span className="text-[11.5px] text-[var(--text-muted)]">
              {checked.size} sélectionnée{checked.size > 1 ? "s" : ""}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">Annuler</button>
              <button
                onClick={applyDateOnly}
                disabled={checked.size === 0}
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-40"
                title="Garde tes propres heures, change juste la date"
              >
                Sans heure
              </button>
              <button
                onClick={applyWithSchedule}
                disabled={checked.size === 0}
                className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-1.5 text-[12.5px] font-medium text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
                title="Avec les heures proposées par l'IA"
              >
                <Icon name="sparkles" size={12} />
                Appliquer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

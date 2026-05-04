"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { aiPlan, PlanResult } from "../lib/ai-client";
import { todayISO } from "../lib/dates";
import { haptic } from "../lib/haptics";
import { Task } from "../lib/types";
import Icon from "./Icon";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function DailyPlan({ open, onClose }: Props) {
  const { tasks, projects, patchTasks } = useStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableMinutes, setAvailableMinutes] = useState<number | undefined>();
  const [focus, setFocus] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

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
      const r = await aiPlan(tasks, projects, { availableMinutes, focus: focus.trim() || undefined });
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

  function apply() {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    patchTasks(ids, { dueDate: todayISO() });
    haptic("success");
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
                {selectedTasks.map((t) => {
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
                        {isChecked && <Icon name="check" size={12} className="text-white" />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13.5px] font-medium text-[var(--text)]">{t.title}</span>
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
          <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg)] px-5 py-3 safe-bottom">
            <span className="text-[11.5px] text-[var(--text-muted)]">
              {checked.size} tâche{checked.size > 1 ? "s" : ""} passera à aujourd&apos;hui
            </span>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">Annuler</button>
              <button
                onClick={apply}
                disabled={checked.size === 0}
                className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                Appliquer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

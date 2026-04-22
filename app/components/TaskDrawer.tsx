"use client";

import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Priority, PRIORITY_LABEL, RecurrenceUnit, Subtask, Task } from "../lib/types";
import { newId } from "../lib/storage";
import { usePomodoro } from "../pomodoro";
import Icon from "./Icon";

type Props = {
  taskId: string | null;
  onClose: () => void;
};

export default function TaskDrawer({ taskId, onClose }: Props) {
  const { tasks, projects, patchTask, deleteTask } = useStore();
  const { start: startPomodoro } = usePomodoro();
  const task = tasks.find((t) => t.id === taskId) ?? null;

  const [draft, setDraft] = useState<Task | null>(task);

  useEffect(() => {
    setDraft(task);
  }, [task?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && taskId) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskId, onClose]);

  if (!taskId || !draft) return null;

  function save(patch: Partial<Task>) {
    if (!draft) return;
    const updated = { ...draft, ...patch };
    setDraft(updated);
    patchTask(draft.id, patch);
  }

  function addSub(title: string) {
    if (!draft) return;
    if (!title.trim()) return;
    const sub: Subtask = { id: newId(), title: title.trim(), done: false };
    save({ subtasks: [...draft.subtasks, sub] });
  }

  function toggleSub(id: string) {
    if (!draft) return;
    save({ subtasks: draft.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  }

  function removeSub(id: string) {
    if (!draft) return;
    save({ subtasks: draft.subtasks.filter((s) => s.id !== id) });
  }

  function updateTags(raw: string) {
    const tags = raw
      .split(",")
      .map((t) => t.trim().replace(/^[@#]/, ""))
      .filter(Boolean);
    save({ tags });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 anim-fade-in" onClick={onClose} />
      <aside className="fixed inset-0 z-50 flex flex-col border-l border-[var(--border)] bg-[var(--bg-elev)] shadow-2xl anim-slide-in sm:inset-y-0 sm:left-auto sm:right-0 sm:h-screen sm:w-full sm:max-w-md">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Détail de la tâche
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (confirm("Supprimer cette tâche ?")) {
                  deleteTask(draft.id);
                  onClose();
                }
              }}
              title="Supprimer"
              className="rounded-md p-1.5 text-[var(--text-muted)] transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
            >
              <Icon name="trash" size={15} />
            </button>
            <button
              onClick={onClose}
              title="Fermer (Esc)"
              className="rounded-md p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-start gap-3">
            <button
              onClick={() => save({ done: !draft.done, doneAt: !draft.done ? new Date().toISOString() : undefined })}
              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition ${
                draft.done
                  ? "border-[var(--accent)] bg-[var(--accent)]"
                  : "border-[var(--border-strong)] hover:border-[var(--accent)]"
              }`}
            >
              {draft.done && <Icon name="check" size={13} className="text-white" />}
            </button>
            <textarea
              value={draft.title}
              onChange={(e) => save({ title: e.target.value })}
              rows={1}
              className={`w-full resize-none bg-transparent text-[17px] font-medium leading-snug outline-none ${
                draft.done ? "text-[var(--text-subtle)] line-through" : ""
              }`}
              placeholder="Titre de la tâche"
            />
          </div>

          <div className="mt-3 ml-8">
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) => save({ notes: e.target.value || undefined })}
              placeholder="Ajouter des notes…"
              rows={3}
              className="w-full resize-none rounded-lg border border-transparent bg-[var(--bg)] px-3 py-2 text-[13px] leading-relaxed outline-none transition hover:border-[var(--border)] focus:border-[var(--accent)]/40"
            />
          </div>

          {!draft.done && (
            <div className="mt-4 ml-8 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  startPomodoro({ taskId: draft.id, taskTitle: draft.title, minutes: draft.estimateMinutes && draft.estimateMinutes <= 60 ? draft.estimateMinutes : 25 });
                  onClose();
                }}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 px-3 py-1.5 text-[12px] font-medium text-white transition active:scale-95"
                title="Démarrer un focus sur cette tâche"
              >
                <Icon name="clock" size={13} />
                Focus {draft.estimateMinutes && draft.estimateMinutes <= 60 ? `(${draft.estimateMinutes} min)` : "(25 min)"}
              </button>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Field label="Priorité" icon="flag">
              <select
                value={draft.priority}
                onChange={(e) => save({ priority: e.target.value as Priority })}
                className={fieldInput}
              >
                {(["none", "low", "medium", "high", "urgent"] as Priority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </Field>

            <Field label="Projet" icon="inbox">
              <select
                value={draft.projectId ?? ""}
                onChange={(e) => save({ projectId: e.target.value || undefined })}
                className={fieldInput}
              >
                <option value="">Boîte de réception</option>
                {projects.filter((p) => p.id !== "inbox").map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Échéance" icon="calendar">
              <input
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(e) => save({ dueDate: e.target.value || undefined })}
                className={fieldInput}
              />
            </Field>

            <Field label="Heure" icon="clock">
              <input
                type="time"
                value={draft.dueTime ?? ""}
                onChange={(e) => save({ dueTime: e.target.value || undefined })}
                className={fieldInput}
              />
            </Field>

            <Field label="Estimation" icon="clock">
              <input
                type="number"
                min={0}
                placeholder="min"
                value={draft.estimateMinutes ?? ""}
                onChange={(e) => save({ estimateMinutes: e.target.value ? parseInt(e.target.value) : undefined })}
                className={fieldInput}
              />
            </Field>

            <Field label="Tags" icon="tag">
              <input
                value={draft.tags.join(", ")}
                onChange={(e) => updateTags(e.target.value)}
                placeholder="urgent, courses"
                className={fieldInput}
              />
            </Field>
          </div>

          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={!!draft.waiting}
                onChange={(e) => save({
                  waiting: e.target.checked,
                  waitingFor: e.target.checked ? draft.waitingFor : undefined,
                })}
                className="h-4 w-4 accent-amber-500"
              />
              <Icon name="pause" size={13} className="text-amber-500" />
              <span className="text-[13px] font-medium">En attente</span>
            </label>
            {draft.waiting && (
              <input
                value={draft.waitingFor ?? ""}
                onChange={(e) => save({ waitingFor: e.target.value || undefined })}
                placeholder="En attente de quoi / qui ?"
                className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1.5 text-[13px] outline-none focus:border-amber-400"
              />
            )}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              <Icon name="repeat" size={11} />
              Répétition
            </div>
            <div className="flex items-center gap-2">
              <select
                value={draft.recurrence?.unit ?? ""}
                onChange={(e) => {
                  const v = e.target.value as RecurrenceUnit | "";
                  if (!v) save({ recurrence: undefined });
                  else save({ recurrence: { unit: v, interval: draft.recurrence?.interval ?? 1 } });
                }}
                className={fieldInput}
              >
                <option value="">Pas de répétition</option>
                <option value="day">Chaque jour</option>
                <option value="week">Chaque semaine</option>
                <option value="month">Chaque mois</option>
                <option value="year">Chaque année</option>
              </select>
              {draft.recurrence && (
                <>
                  <span className="text-[11px] text-[var(--text-muted)]">tous les</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.recurrence.interval}
                    onChange={(e) =>
                      save({
                        recurrence: draft.recurrence
                          ? { ...draft.recurrence, interval: Math.max(1, parseInt(e.target.value) || 1) }
                          : undefined,
                      })
                    }
                    className={`${fieldInput} w-16`}
                  />
                </>
              )}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                <Icon name="list" size={11} />
                Sous-tâches
              </div>
              <div className="text-[11px] tabular-nums text-[var(--text-subtle)]">
                {draft.subtasks.filter((s) => s.done).length}/{draft.subtasks.length}
              </div>
            </div>
            <div className="space-y-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
              {draft.subtasks.map((s) => (
                <div key={s.id} className="group flex items-center gap-2 rounded-md px-2 py-1 transition hover:bg-[var(--bg-hover)]">
                  <button
                    onClick={() => toggleSub(s.id)}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px] transition ${
                      s.done
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--border-strong)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {s.done && <Icon name="check" size={10} className="text-white" />}
                  </button>
                  <input
                    value={s.title}
                    onChange={(e) => {
                      const title = e.target.value;
                      save({ subtasks: draft.subtasks.map((x) => (x.id === s.id ? { ...x, title } : x)) });
                    }}
                    className={`flex-1 bg-transparent text-[13px] outline-none ${s.done ? "text-[var(--text-subtle)] line-through" : ""}`}
                  />
                  <button
                    onClick={() => removeSub(s.id)}
                    className="invisible text-[var(--text-subtle)] transition hover:text-rose-600 group-hover:visible"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
              <SubtaskAdd onAdd={addSub} />
            </div>
          </div>

          <div className="mt-8 text-[11px] text-[var(--text-subtle)]">
            Créée le {new Date(draft.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            {draft.doneAt && ` · Terminée le ${new Date(draft.doneAt).toLocaleDateString("fr-FR")}`}
          </div>
        </div>
      </aside>
    </>
  );
}

const fieldInput =
  "w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[13px] outline-none transition hover:border-[var(--border-strong)] focus:border-[var(--accent)]/50";

function Field({ label, icon, children }: { label: string; icon: Parameters<typeof Icon>[0]["name"]; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        <Icon name={icon} size={11} />
        {label}
      </div>
      {children}
    </label>
  );
}

function SubtaskAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(v);
        setV("");
      }}
      className="flex items-center gap-2 rounded-md px-2 py-1"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px] border-dashed border-[var(--border-strong)] text-[var(--text-subtle)]">
        <Icon name="plus" size={10} />
      </span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Ajouter une sous-tâche"
        className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--text-subtle)]"
      />
    </form>
  );
}

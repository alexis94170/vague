"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { usePomodoro } from "../pomodoro";
import { useToast } from "../toast";
import { Subtask } from "../lib/types";
import { newId } from "../lib/storage";
import { haptic } from "../lib/haptics";
import Icon from "./Icon";

type Props = {
  taskId: string | null;
  onClose: () => void;
};

export default function FocusMode({ taskId, onClose }: Props) {
  const { tasks, projects, toggleDone, patchTask } = useStore();
  const pomo = usePomodoro();
  const toast = useToast();
  const task = useMemo(() => tasks.find((t) => t.id === taskId) ?? null, [tasks, taskId]);
  const [subInput, setSubInput] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (taskId) {
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      return () => {
        window.removeEventListener("keydown", onKey);
        document.body.style.overflow = "";
      };
    }
  }, [taskId, onClose]);

  if (!taskId || !task) return null;

  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const subDone = task.subtasks.filter((s) => s.done).length;
  const subTotal = task.subtasks.length;
  const pomoRunning = pomo.active && pomo.state?.taskId === task.id;
  const remaining = pomo.remaining;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const displayTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  function toggleSub(id: string) {
    const next = task!.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
    patchTask(task!.id, { subtasks: next });
    haptic("medium");
  }
  function addSub() {
    const v = subInput.trim();
    if (!v) return;
    const sub: Subtask = { id: newId(), title: v, done: false };
    patchTask(task!.id, { subtasks: [...task!.subtasks, sub] });
    setSubInput("");
  }

  function done() {
    toggleDone(task!.id);
    haptic("success");
    toast.show({ message: "Bravo — tâche terminée 🌊", tone: "success" });
    onClose();
  }

  function startPomo() {
    pomo.start({ taskId: task!.id, taskTitle: task!.title, minutes: 25 });
    haptic("medium");
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg)] safe-top safe-bottom anim-fade-in">
      <div className="flex w-full max-w-2xl flex-col gap-6 px-6 py-8 sm:py-12">
        <header className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <Icon name="x" size={13} />
            Quitter le focus
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Mode focus</span>
        </header>

        <div className="space-y-3">
          {project && (
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-hover)] px-3 py-1 text-[12px] font-medium text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />
              {project.name}
            </span>
          )}
          <h1 className={`text-[28px] font-bold leading-tight tracking-tight sm:text-[36px] ${task.done ? "text-[var(--text-subtle)] line-through" : "text-[var(--text)]"}`}>
            {task.title}
          </h1>
          {task.notes && (
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text-muted)]">{task.notes}</p>
          )}
        </div>

        {/* Pomodoro */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Session focus</div>
              <div className="mt-1 text-[24px] font-bold tabular-nums">
                {pomoRunning ? displayTime : "25:00"}
              </div>
            </div>
            {pomoRunning ? (
              <button
                onClick={() => pomo.stop()}
                className="rounded-full bg-rose-500 px-4 py-2 text-[12.5px] font-medium text-white"
              >
                Arrêter
              </button>
            ) : (
              <button
                onClick={startPomo}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-white"
              >
                ▶ Démarrer 25 min
              </button>
            )}
          </div>
        </div>

        {/* Subtasks */}
        {subTotal > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Sous-étapes</div>
              <div className="text-[11.5px] tabular-nums text-[var(--text-muted)]">{subDone}/{subTotal}</div>
            </div>
            <div className="space-y-1.5">
              {task.subtasks.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleSub(s.id)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-[1.5px] ${
                    s.done ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)]"
                  }`}>
                    {s.done && <Icon name="check" size={12} className="text-white" />}
                  </span>
                  <span className={`text-[14px] ${s.done ? "text-[var(--text-subtle)] line-through" : ""}`}>{s.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add subtask quickly */}
        <form
          onSubmit={(e) => { e.preventDefault(); addSub(); }}
          className="flex items-center gap-2"
        >
          <input
            value={subInput}
            onChange={(e) => setSubInput(e.target.value)}
            placeholder="+ Décomposer en étapes…"
            className="flex-1 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-4 py-2 text-[13px] outline-none focus:border-[var(--accent)]/40"
          />
          {subInput.trim() && (
            <button type="submit" className="rounded-full bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-white">
              Ajouter
            </button>
          )}
        </form>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-4 py-2 text-[12.5px] text-[var(--text-muted)]"
          >
            Continuer plus tard
          </button>
          {!task.done && (
            <button
              onClick={done}
              className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-[13px] font-semibold text-white active:scale-95"
            >
              <Icon name="check" size={14} />
              C&apos;est fait !
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { todayISO } from "../lib/dates";
import { PRIORITY_ORDER } from "../lib/types";
import Icon from "./Icon";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function TodayPicker({ open, onClose }: Props) {
  const { tasks, projects, patchTasks } = useStore();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterProject, setFilterProject] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSelected(new Set());
      setFilterProject("");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (open && e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const today = todayISO();

  const candidates = useMemo(() => {
    const query = q.trim().toLowerCase();
    return tasks
      .filter((t) => !t.done && t.dueDate !== today)
      .filter((t) => !filterProject || t.projectId === filterProject)
      .filter((t) =>
        !query ||
        t.title.toLowerCase().includes(query) ||
        t.tags.some((g) => g.toLowerCase().includes(query)) ||
        (t.notes?.toLowerCase().includes(query) ?? false)
      )
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority];
        const pb = PRIORITY_ORDER[b.priority];
        if (pa !== pb) return pa - pb;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [tasks, q, filterProject, today]);

  const projectsById = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    projects.forEach((p) => m.set(p.id, { name: p.name, color: p.color }));
    return m;
  }, [projects]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) return;
    patchTasks(Array.from(selected), { dueDate: today });
    onClose();
  }

  if (!open) return null;

  const hasProjects = projects.filter((p) => p.id !== "inbox").length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/30 anim-fade-in sm:items-start sm:pt-16" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-[var(--bg-elev)] shadow-2xl anim-scale-in sm:max-h-[80vh] sm:max-w-2xl sm:rounded-xl sm:border sm:border-[var(--border)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="sun" size={15} className="text-amber-500" />
            <h2 className="text-[14px] font-medium">Ajouter à aujourd'hui</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
          <Icon name="search" size={14} className="text-[var(--text-subtle)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher parmi tes tâches…"
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--text-subtle)]"
          />
          {hasProjects && (
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11.5px] outline-none"
            >
              <option value="">Tous les projets</option>
              {projects.filter((p) => p.id !== "inbox").map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-[var(--text-subtle)]">
              {q ? "Aucun résultat." : "Aucune tâche à ajouter — tout est déjà dans aujourd'hui."}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]/60">
              {candidates.map((t) => {
                const proj = t.projectId ? projectsById.get(t.projectId) : null;
                const checked = selected.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                      checked ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px] ${
                      checked ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)]"
                    }`}>
                      {checked && <Icon name="check" size={11} className="text-white" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13px] text-[var(--text)]">{t.title}</span>
                      <span className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        {proj && proj.name && (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: proj.color }} />
                            {proj.name}
                          </span>
                        )}
                        {t.priority !== "none" && (
                          <span className={
                            t.priority === "urgent" ? "text-rose-500" :
                            t.priority === "high" ? "text-orange-500" :
                            t.priority === "medium" ? "text-amber-500" : "text-sky-500"
                          }>
                            {t.priority === "urgent" ? "Urgente" :
                             t.priority === "high" ? "Haute" :
                             t.priority === "medium" ? "Moyenne" : "Basse"}
                          </span>
                        )}
                        {t.dueDate && (
                          <span>{new Date(t.dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                        )}
                        {t.tags.map((g) => (
                          <span key={g} className="text-teal-600 dark:text-teal-400">#{g}</span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <span className="text-[11.5px] text-[var(--text-muted)]">
            {selected.size > 0 ? `${selected.size} sélectionnée${selected.size > 1 ? "s" : ""}` : "Choisis les tâches à déplacer à aujourd'hui"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              Annuler
            </button>
            <button
              onClick={submit}
              disabled={selected.size === 0}
              className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
            >
              Ajouter à aujourd'hui
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { ViewKind } from "../lib/views";
import Icon, { IconName } from "./Icon";

type Props = {
  open: boolean;
  onClose: () => void;
  onNavigate: (v: ViewKind) => void;
  onOpenTask: (id: string) => void;
};

type Item =
  | { kind: "view"; view: ViewKind; label: string; icon: IconName }
  | { kind: "task"; id: string; label: string; sub?: string };

export default function CommandPalette({ open, onClose, onNavigate, onOpenTask }: Props) {
  const { projects, tasks } = useStore();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const query = q.trim().toLowerCase();
    const views: Item[] = [
      { kind: "view", view: { kind: "today" }, label: "Aujourd'hui", icon: "sun" },
      { kind: "view", view: { kind: "calendar" }, label: "Calendrier", icon: "calendar" },
      { kind: "view", view: { kind: "untriaged" }, label: "À trier", icon: "inbox" },
      { kind: "view", view: { kind: "all" }, label: "Toutes les tâches", icon: "list" },
      { kind: "view", view: { kind: "waiting" }, label: "En attente", icon: "pause" },
      { kind: "view", view: { kind: "completed" }, label: "Terminées", icon: "check" },
      ...projects.map((p) => ({
        kind: "view" as const,
        view: { kind: "project" as const, id: p.id },
        label: `Projet · ${p.name}`,
        icon: "inbox" as IconName,
      })),
    ];
    if (!query) return views;
    const taskMatches: Item[] = tasks
      .filter((t) =>
        t.title.toLowerCase().includes(query) ||
        (t.notes?.toLowerCase().includes(query) ?? false) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query))
      )
      .slice(0, 12)
      .map((t) => ({
        kind: "task" as const,
        id: t.id,
        label: t.title,
        sub: t.done ? "Terminée" : undefined,
      }));
    const viewMatches = views.filter((it) => it.label.toLowerCase().includes(query));
    return [...viewMatches, ...taskMatches];
  }, [q, tasks, projects]);

  useEffect(() => setI(0), [q]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const it = items[i];
        if (!it) return;
        if (it.kind === "view") onNavigate(it.view);
        else onOpenTask(it.id);
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, i, onClose, onNavigate, onOpenTask]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 pt-4 anim-fade-in sm:pt-24" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-2 w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] shadow-2xl anim-scale-in sm:mx-0"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Icon name="search" size={16} className="text-[var(--text-subtle)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une tâche, un projet, une vue…"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--text-subtle)]"
          />
        </div>
        <div className="max-h-96 overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-[var(--text-subtle)]">Aucun résultat</div>
          ) : (
            items.map((it, idx) => {
              const icon: IconName = it.kind === "view" ? it.icon : "check";
              return (
                <button
                  key={it.kind === "view" ? `v-${it.label}` : `t-${it.id}`}
                  onMouseEnter={() => setI(idx)}
                  onClick={() => {
                    if (it.kind === "view") onNavigate(it.view);
                    else onOpenTask(it.id);
                    onClose();
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] transition ${
                    idx === i ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""
                  }`}
                >
                  <Icon name={icon} size={14} className={idx === i ? "" : "text-[var(--text-subtle)]"} />
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.kind === "task" && it.sub && (
                    <span className="text-[11px] text-[var(--text-subtle)]">{it.sub}</span>
                  )}
                  {idx === i && <Icon name="chevron-right" size={12} />}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[10.5px] text-[var(--text-subtle)]">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1 py-px font-mono">↑↓</kbd>
            naviguer
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1 py-px font-mono">⏎</kbd>
            ouvrir
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1 py-px font-mono">Esc</kbd>
            fermer
          </span>
        </div>
      </div>
    </div>
  );
}

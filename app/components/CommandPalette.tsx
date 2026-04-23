"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { ViewKind } from "../lib/views";
import { todayISO } from "../lib/dates";
import { Priority, Task } from "../lib/types";
import Icon, { IconName } from "./Icon";

type Props = {
  open: boolean;
  onClose: () => void;
  onNavigate: (v: ViewKind) => void;
  onOpenTask: (id: string) => void;
};

type Item =
  | { kind: "view"; view: ViewKind; label: string; icon: IconName; sub?: string }
  | { kind: "task"; id: string; label: string; sub?: string; task: Task };

type Filters = {
  text: string;
  priorities: Set<Priority>;
  tags: Set<string>;
  projectQuery: string | null;
  status: "active" | "done" | "waiting" | "overdue" | null;
};

const PRIORITY_KEYS: Record<string, Priority> = {
  urgent: "urgent",
  urg: "urgent",
  haute: "high",
  high: "high",
  moyenne: "medium",
  med: "medium",
  basse: "low",
  low: "low",
};

function parseQuery(q: string): Filters {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  const filters: Filters = {
    text: "",
    priorities: new Set(),
    tags: new Set(),
    projectQuery: null,
    status: null,
  };
  const remaining: string[] = [];
  for (const tok of tokens) {
    if (tok.startsWith("!") && tok.length > 1) {
      const p = PRIORITY_KEYS[tok.slice(1).toLowerCase()];
      if (p) filters.priorities.add(p);
      continue;
    }
    if (tok.startsWith("#") && tok.length > 1) {
      filters.tags.add(tok.slice(1).toLowerCase());
      continue;
    }
    if (tok.startsWith("@") && tok.length > 1) {
      filters.projectQuery = tok.slice(1).toLowerCase();
      continue;
    }
    const lower = tok.toLowerCase();
    if (["fait", "done", "terminee", "terminé", "terminée"].includes(lower)) { filters.status = "done"; continue; }
    if (["attente", "waiting"].includes(lower)) { filters.status = "waiting"; continue; }
    if (["retard", "overdue"].includes(lower)) { filters.status = "overdue"; continue; }
    if (lower === "actives" || lower === "active") { filters.status = "active"; continue; }
    remaining.push(tok);
  }
  filters.text = remaining.join(" ").toLowerCase();
  return filters;
}

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
    const today = todayISO();
    const views: Item[] = [
      { kind: "view", view: { kind: "dashboard" }, label: "Tableau de bord", icon: "sparkles" },
      { kind: "view", view: { kind: "today" }, label: "Aujourd'hui", icon: "sun" },
      { kind: "view", view: { kind: "calendar" }, label: "Calendrier", icon: "calendar" },
      { kind: "view", view: { kind: "agenda" }, label: "Agenda", icon: "list" },
      { kind: "view", view: { kind: "untriaged" }, label: "À trier", icon: "inbox" },
      { kind: "view", view: { kind: "all" }, label: "Toutes les tâches", icon: "list" },
      { kind: "view", view: { kind: "waiting" }, label: "En attente", icon: "pause" },
      { kind: "view", view: { kind: "completed" }, label: "Terminées", icon: "check" },
      { kind: "view", view: { kind: "trash" }, label: "Corbeille", icon: "trash" },
      ...projects.filter((p) => p.id !== "inbox").map((p) => ({
        kind: "view" as const,
        view: { kind: "project" as const, id: p.id },
        label: `Projet · ${p.name}`,
        icon: "inbox" as IconName,
      })),
    ];

    const query = q.trim();
    if (!query) return views;

    const f = parseQuery(q);
    const hasFilters = f.priorities.size > 0 || f.tags.size > 0 || !!f.projectQuery || !!f.status;

    const projectById = new Map(projects.map((p) => [p.id, p]));

    const taskMatches = tasks
      .filter((t) => !t.deletedAt)
      .filter((t) => {
        // Status
        if (f.status === "done") { if (!t.done) return false; }
        else if (f.status === "waiting") { if (!t.waiting) return false; }
        else if (f.status === "overdue") { if (t.done || !t.dueDate || t.dueDate >= today) return false; }
        else if (f.status === "active") { if (t.done || t.waiting) return false; }
        // Priority
        if (f.priorities.size > 0 && !f.priorities.has(t.priority)) return false;
        // Tags
        if (f.tags.size > 0) {
          for (const tag of f.tags) {
            if (!t.tags.some((g) => g.toLowerCase().includes(tag))) return false;
          }
        }
        // Project
        if (f.projectQuery) {
          const proj = t.projectId ? projectById.get(t.projectId) : null;
          if (!proj || !proj.name.toLowerCase().includes(f.projectQuery)) return false;
        }
        // Text
        if (f.text) {
          if (
            !t.title.toLowerCase().includes(f.text) &&
            !(t.notes?.toLowerCase().includes(f.text) ?? false)
          ) return false;
        }
        return true;
      })
      .slice(0, 20)
      .map<Item>((t) => {
        const proj = t.projectId ? projectById.get(t.projectId) : null;
        const sub: string[] = [];
        if (t.done) sub.push("Terminée");
        else if (t.waiting) sub.push("Attente");
        else if (t.dueDate && t.dueDate < today) sub.push("Retard");
        if (proj) sub.push(proj.name);
        if (t.priority !== "none") sub.push(t.priority);
        return {
          kind: "task" as const,
          id: t.id,
          label: t.title,
          sub: sub.join(" · "),
          task: t,
        };
      });

    const viewMatches = hasFilters
      ? []
      : views.filter((it) => it.label.toLowerCase().includes(q.toLowerCase()));

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
            placeholder="Chercher… ou !urgent #tag @projet retard"
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
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">{it.label}</span>
                    {it.sub && <span className="truncate text-[11px] text-[var(--text-subtle)]">{it.sub}</span>}
                  </span>
                  {idx === i && <Icon name="chevron-right" size={12} />}
                </button>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[10.5px] text-[var(--text-subtle)]">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1 py-px font-mono">↑↓</kbd>
            naviguer
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1 py-px font-mono">⏎</kbd>
            ouvrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1 py-px font-mono">Esc</kbd>
            fermer
          </span>
          <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
            !urgent · #tag · @projet · retard · fait · attente
          </span>
        </div>
      </div>
    </div>
  );
}

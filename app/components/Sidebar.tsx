"use client";

import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useAuth } from "../auth";
import { ViewKind } from "../lib/views";
import { todayISO } from "../lib/dates";
import Icon, { IconName } from "./Icon";

type Props = {
  view: ViewKind;
  onViewChange: (v: ViewKind) => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onOpenTemplates: () => void;
};

const VIEW_ITEMS: Array<{ kind: ViewKind["kind"]; label: string; icon: IconName }> = [
  { kind: "dashboard", label: "Accueil", icon: "sparkles" },
  { kind: "today", label: "Aujourd'hui", icon: "sun" },
  { kind: "calendar", label: "Calendrier", icon: "calendar" },
  { kind: "agenda", label: "Agenda", icon: "list" },
  { kind: "untriaged", label: "À trier", icon: "inbox" },
  { kind: "all", label: "Toutes", icon: "list" },
  { kind: "waiting", label: "En attente", icon: "pause" },
  { kind: "completed", label: "Terminées", icon: "check" },
  { kind: "trash", label: "Corbeille", icon: "trash" },
];

export default function Sidebar({
  view,
  onViewChange,
  onOpenImport,
  onOpenExport,
  onOpenPalette,
  onOpenSettings,
  onOpenTemplates,
}: Props) {
  const { projects, tasks, allTags, addProject, deleteProject, renameProject, reorderProjects, syncing, syncError, online, pendingOps } = useStore();
  const { user, signOut } = useAuth();
  const [newProject, setNewProject] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const today = todayISO();
    const c = {
      dashboard: 0,
      today: 0,
      calendar: 0,
      untriaged: 0,
      all: 0,
      waiting: 0,
      completed: 0,
      trash: 0,
      byProject: new Map<string, number>(),
      byTag: new Map<string, number>(),
    };
    tasks.forEach((t) => {
      if (t.deletedAt) {
        c.trash++;
        return;
      }
      if (t.done) {
        c.completed++;
        return;
      }
      if (t.waiting) {
        c.waiting++;
        if (t.projectId) {
          c.byProject.set(t.projectId, (c.byProject.get(t.projectId) ?? 0) + 1);
        }
        return;
      }
      c.all++;
      if (!t.projectId || t.projectId === "inbox") c.untriaged++;
      if (t.dueDate) c.calendar++;
      if (t.dueDate && t.dueDate <= today) c.today++;
      if (t.projectId) {
        c.byProject.set(t.projectId, (c.byProject.get(t.projectId) ?? 0) + 1);
      }
      t.tags.forEach((g) => c.byTag.set(g, (c.byTag.get(g) ?? 0) + 1));
    });
    return c;
  }, [tasks]);

  function isActive(k: ViewKind): boolean {
    if (view.kind !== k.kind) return false;
    if (k.kind === "project" && view.kind === "project") return view.id === k.id;
    if (k.kind === "tag" && view.kind === "tag") return view.tag === k.tag;
    return true;
  }

  function submitNewProject(e: React.FormEvent) {
    e.preventDefault();
    const name = newProject.trim();
    if (!name) return;
    const p = addProject(name);
    setNewProject("");
    onViewChange({ kind: "project", id: p.id });
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elev)] md:bg-[var(--bg)]/80 md:backdrop-blur">
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12c2-4 5-4 7 0s5 4 7 0 4-4 4-4" />
            </svg>
          </div>
          <h1 className="text-[15px] font-semibold tracking-tight">Vague</h1>
        </div>
        <button
          onClick={onOpenPalette}
          title="Recherche (Ctrl+K)"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[var(--text-subtle)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-muted)]"
        >
          <Icon name="search" size={13} />
          <span>⌘K</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-px">
          {VIEW_ITEMS.map((item) => {
            const count =
              item.kind === "dashboard" ? 0 :
              item.kind === "today" ? counts.today :
              item.kind === "calendar" ? counts.calendar :
              item.kind === "agenda" ? counts.calendar :
              item.kind === "untriaged" ? counts.untriaged :
              item.kind === "all" ? counts.all :
              item.kind === "waiting" ? counts.waiting :
              item.kind === "trash" ? counts.trash :
              counts.completed;
            const active = isActive({ kind: item.kind } as ViewKind);
            return (
              <li key={item.kind}>
                <button
                  onClick={() => onViewChange({ kind: item.kind } as ViewKind)}
                  className={`group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] transition ${
                    active
                      ? "bg-[var(--bg-hover)] font-medium text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon name={item.icon} size={14} className={active ? "text-[var(--text)]" : "text-[var(--text-subtle)] group-hover:text-[var(--text-muted)]"} />
                    <span>{item.label}</span>
                  </span>
                  {count > 0 && (
                    <span className="text-[11px] tabular-nums text-[var(--text-subtle)]">
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-center justify-between px-2.5 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Projets
          </span>
        </div>
        <ul className="space-y-px">
          {projects.map((p) => {
            const active = view.kind === "project" && view.id === p.id;
            const count = counts.byProject.get(p.id) ?? 0;
            const isEditing = editingId === p.id;
            return (
              <li key={p.id} className="group">
                {isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = editName.trim();
                      if (n) renameProject(p.id, n);
                      setEditingId(null);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => setEditingId(null)}
                      className="flex-1 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[13px] outline-none"
                    />
                  </form>
                ) : (
                  <div
                    className={`flex items-center ${dragOverId === p.id && draggedId !== p.id ? "border-t-2 border-[var(--accent)]" : ""}`}
                    draggable={p.id !== "inbox"}
                    onDragStart={() => setDraggedId(p.id)}
                    onDragEnd={() => {
                      if (draggedId && dragOverId && draggedId !== dragOverId) {
                        const orderedIds = projects.map((pp) => pp.id);
                        const fromIdx = orderedIds.indexOf(draggedId);
                        const toIdx = orderedIds.indexOf(dragOverId);
                        if (fromIdx >= 0 && toIdx >= 0) {
                          const next = [...orderedIds];
                          const [moved] = next.splice(fromIdx, 1);
                          next.splice(toIdx, 0, moved);
                          reorderProjects(next);
                        }
                      }
                      setDraggedId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(e) => {
                      if (draggedId && draggedId !== p.id && p.id !== "inbox") {
                        e.preventDefault();
                        setDragOverId(p.id);
                      }
                    }}
                    onDragLeave={() => setDragOverId((c) => (c === p.id ? null : c))}
                  >
                    <button
                      onClick={() => onViewChange({ kind: "project", id: p.id })}
                      onDoubleClick={() => {
                        setEditingId(p.id);
                        setEditName(p.name);
                      }}
                      className={`flex flex-1 items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] transition ${
                        active
                          ? "bg-[var(--bg-hover)] font-medium text-[var(--text)]"
                          : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full ring-2 ring-transparent transition group-hover:ring-[var(--bg-hover)]"
                          style={{ background: p.color }}
                        />
                        <span className="truncate">{p.name}</span>
                      </span>
                      {count > 0 && (
                        <span className="text-[11px] tabular-nums text-[var(--text-subtle)]">
                          {count}
                        </span>
                      )}
                    </button>
                    {p.id !== "inbox" && (
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer le projet « ${p.name} » ? Les tâches seront déplacées vers la boîte de réception.`)) {
                            deleteProject(p.id);
                          }
                        }}
                        className="invisible ml-0.5 rounded p-1 text-[var(--text-subtle)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--danger)] group-hover:visible"
                        title="Supprimer"
                      >
                        <Icon name="x" size={12} />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          <li>
            <form onSubmit={submitNewProject} className="px-2.5 pt-1">
              <div className="flex items-center gap-2.5 rounded-md px-0 py-1 text-[13px]">
                <Icon name="plus" size={13} className="text-[var(--text-subtle)]" />
                <input
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  placeholder="Nouveau projet"
                  className="w-full bg-transparent outline-none placeholder:text-[var(--text-subtle)]"
                />
              </div>
            </form>
          </li>
        </ul>

        {allTags.length > 0 && (
          <>
            <div className="mt-6 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Tags
            </div>
            <ul className="space-y-px">
              {allTags.map((tag) => {
                const active = view.kind === "tag" && view.tag === tag;
                const count = counts.byTag.get(tag) ?? 0;
                return (
                  <li key={tag}>
                    <button
                      onClick={() => onViewChange({ kind: "tag", tag })}
                      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] transition ${
                        active
                          ? "bg-[var(--bg-hover)] font-medium text-[var(--text)]"
                          : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span className="text-[var(--text-subtle)]">#</span>
                        {tag}
                      </span>
                      <span className="text-[11px] tabular-nums text-[var(--text-subtle)]">{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-2">
        <button
          onClick={onOpenImport}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        >
          <Icon name="upload" size={13} className="text-[var(--text-subtle)]" />
          Importer
        </button>
        <button
          onClick={onOpenExport}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        >
          <Icon name="download" size={13} className="text-[var(--text-subtle)]" />
          Exporter
        </button>
        <button
          onClick={onOpenTemplates}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        >
          <Icon name="list" size={13} className="text-[var(--text-subtle)]" />
          Modèles
        </button>
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        >
          <Icon name="dots" size={13} className="text-[var(--text-subtle)]" />
          Réglages
        </button>
      </div>

      {user && (
        <div className="relative border-t border-[var(--border)] px-3 py-2.5">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-[12px] transition hover:bg-[var(--bg-hover)]"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-semibold text-[var(--accent-fg)]">
              {(user.email ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-[var(--text)]">{user.email}</div>
              <div className="flex items-center gap-1 text-[10px] text-[var(--text-subtle)]">
                {!online ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                    Hors-ligne{pendingOps > 0 ? ` · ${pendingOps} en attente` : ""}
                  </>
                ) : syncError && pendingOps > 0 ? (
                  <span className="text-orange-500">⟲ {pendingOps} en attente</span>
                ) : syncError ? (
                  <span className="text-rose-500">⚠ {syncError.slice(0, 30)}</span>
                ) : syncing ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    Synchronisation…
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Synchronisé
                  </>
                )}
              </div>
            </span>
          </button>
          {menuOpen && (
            <div
              className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] shadow-lg anim-scale-in"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-900/20"
              >
                <Icon name="x" size={12} />
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { ViewKind, viewTitle } from "./lib/views";
import Sidebar from "./components/Sidebar";
import QuickAdd from "./components/QuickAdd";
import TaskList from "./components/TaskList";
import TaskDrawer from "./components/TaskDrawer";
import CommandPalette from "./components/CommandPalette";
import ImportDialog from "./components/ImportDialog";
import ExportDialog from "./components/ExportDialog";
import TodayPicker from "./components/TodayPicker";
import Icon from "./components/Icon";
import { todayISO } from "./lib/dates";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function Home() {
  const { projects, tasks } = useStore();
  const [view, setView] = useState<ViewKind>({ kind: "today" });
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [todayPickerOpen, setTodayPickerOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i" && e.shiftKey) {
        e.preventDefault();
        setImportOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const project = view.kind === "project" ? projects.find((p) => p.id === view.id) : null;

  const subtitle = useMemo(() => {
    const today = todayISO();
    if (view.kind === "today") {
      const todaysTasks = tasks.filter((t) => !t.done && t.dueDate && t.dueDate <= today);
      const n = todaysTasks.length;
      if (n === 0) return "Aucune tâche à traiter pour aujourd'hui.";
      const urgent = todaysTasks.filter((t) => t.priority === "urgent").length;
      if (urgent > 0) return `${n} tâche${n > 1 ? "s" : ""} · dont ${urgent} urgente${urgent > 1 ? "s" : ""}`;
      return `${n} tâche${n > 1 ? "s" : ""} à traiter`;
    }
    const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    return date.charAt(0).toUpperCase() + date.slice(1);
  }, [tasks, view]);

  const title = view.kind === "today" ? `${greeting()}.` : viewTitle(view, project?.name);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        view={view}
        onViewChange={setView}
        onOpenImport={() => setImportOpen(true)}
        onOpenExport={() => setExportOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--border)] glass px-8 py-5">
          <div className="flex min-w-0 items-center gap-3">
            {project && (
              <span
                className="h-3 w-3 shrink-0 rounded-full shadow-sm"
                style={{ background: project.color }}
              />
            )}
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight">{title}</h2>
              <div className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">{subtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {view.kind === "today" && (
              <button
                onClick={() => setTodayPickerOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
              >
                <Icon name="plus" size={12} />
                Ajouter des tâches existantes
              </button>
            )}
            <div className="hidden items-center gap-3 text-[11px] text-[var(--text-subtle)] sm:flex">
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1.5 py-0.5 font-mono">N</kbd>
              <span>nouvelle</span>
              <span className="opacity-40">·</span>
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1.5 py-0.5 font-mono">⌘K</kbd>
              <span>rechercher</span>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl px-6 pt-6">
          <QuickAdd view={view} />
        </div>

        <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-24 pt-4">
          <TaskList view={view} onOpenTask={setOpenTaskId} />
        </div>
      </main>

      <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={setView}
        onOpenTask={setOpenTaskId}
      />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <TodayPicker open={todayPickerOpen} onClose={() => setTodayPickerOpen(false)} />
    </div>
  );
}

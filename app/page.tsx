"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { ViewKind, viewTitle } from "./lib/views";
import Sidebar from "./components/Sidebar";
import QuickAdd from "./components/QuickAdd";
import MobileQuickAdd from "./components/MobileQuickAdd";
import BottomNav from "./components/BottomNav";
import TaskList from "./components/TaskList";
import TaskDrawer from "./components/TaskDrawer";
import CommandPalette from "./components/CommandPalette";
import ImportDialog from "./components/ImportDialog";
import ExportDialog from "./components/ExportDialog";
import TodayPicker from "./components/TodayPicker";
import SettingsDialog from "./components/SettingsDialog";
import DailyPlan from "./components/DailyPlan";
import AssistantChat from "./components/AssistantChat";
import CalendarView from "./components/CalendarView";
import Dashboard from "./components/Dashboard";
import PomodoroWidget from "./components/PomodoroWidget";
import Notifications from "./components/Notifications";
import InstallPrompt from "./components/InstallPrompt";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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

  function navigate(v: ViewKind) {
    setView(v);
    setSidebarOpen(false);
  }

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
    <div className="relative flex min-h-screen">
      {/* Sidebar overlay backdrop on mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden anim-fade-in"
        />
      )}

      {/* Sidebar: fixed drawer on mobile, static on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          view={view}
          onViewChange={navigate}
          onOpenImport={() => { setImportOpen(true); setSidebarOpen(false); }}
          onOpenExport={() => { setExportOpen(true); setSidebarOpen(false); }}
          onOpenPalette={() => { setPaletteOpen(true); setSidebarOpen(false); }}
          onOpenSettings={() => { setSettingsOpen(true); setSidebarOpen(false); }}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col safe-b-nav md:pb-0">
        {/* Desktop header */}
        <header className="sticky top-0 z-20 hidden items-center justify-between gap-3 border-b border-[var(--border)] glass px-8 py-5 md:flex">
          <div className="flex min-w-0 items-center gap-3">
            {project && (
              <span className="h-3 w-3 shrink-0 rounded-full shadow-sm" style={{ background: project.color }} />
            )}
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight">{title}</h2>
              <div className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">{subtitle}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {view.kind === "today" && (
              <button
                onClick={() => setPlanOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition active:scale-95"
              >
                <Icon name="sparkles" size={13} />
                Planifier ma journée
              </button>
            )}
            <button
              onClick={() => setChatOpen(true)}
              title="Assistant IA"
              className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 text-[12px] font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
            >
              <Icon name="sparkles" size={13} />
              Assistant
            </button>
            {view.kind === "today" && (
              <button
                onClick={() => setTodayPickerOpen(true)}
                title="Ajouter des tâches existantes"
                className="hidden items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] md:flex"
              >
                <Icon name="plus" size={12} />
                Depuis la liste
              </button>
            )}
            <div className="hidden items-center gap-3 text-[11px] text-[var(--text-subtle)] lg:flex">
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1.5 py-0.5 font-mono">N</kbd>
              <span>nouvelle</span>
              <span className="opacity-40">·</span>
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-1.5 py-0.5 font-mono">⌘K</kbd>
              <span>rechercher</span>
            </div>
          </div>
        </header>

        {/* Mobile header: large title iOS-style */}
        <header className="glass sticky top-0 z-20 border-b border-[var(--border)] pt-safe md:hidden">
          <div className="flex items-center justify-between px-4 pb-1 pt-1">
            <button
              onClick={() => setPaletteOpen(true)}
              className="tappable no-select flex items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--bg-hover)]"
              aria-label="Rechercher"
            >
              <Icon name="search" size={20} />
            </button>
            <div className="flex items-center gap-2">
              {view.kind === "today" && (
                <button
                  onClick={() => setPlanOpen(true)}
                  className="no-select flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 px-3 py-1.5 text-[12px] font-medium text-white active:scale-95"
                >
                  <Icon name="sparkles" size={12} />
                  Planifier
                </button>
              )}
              <button
                onClick={() => setChatOpen(true)}
                className="no-select tappable flex items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--bg-hover)]"
                aria-label="Assistant"
              >
                <Icon name="sparkles" size={20} />
              </button>
            </div>
          </div>
          <div className="px-4 pb-3 pt-1">
            <div className="flex items-center gap-2.5">
              {project && (
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
              )}
              <h2 className="truncate text-[28px] font-bold leading-tight tracking-tight">{title}</h2>
            </div>
            <div className="mt-1 text-[13px] text-[var(--text-muted)]">{subtitle}</div>
          </div>
        </header>

        {/* Desktop quick-add */}
        <div className="mx-auto hidden w-full max-w-3xl px-6 pt-6 md:block">
          <QuickAdd view={view} />
        </div>

        <div className="mx-auto w-full max-w-4xl flex-1 px-3 pb-6 pt-3 sm:px-6 md:pb-24 md:pt-4">
          {view.kind === "dashboard" ? (
            <Dashboard
              onOpenPlan={() => setPlanOpen(true)}
              onOpenChat={() => setChatOpen(true)}
              onNavigate={(k) => setView({ kind: k } as ViewKind)}
            />
          ) : view.kind === "calendar" ? (
            <CalendarView onOpenTask={setOpenTaskId} />
          ) : (
            <TaskList view={view} onOpenTask={setOpenTaskId} />
          )}
        </div>
      </main>

      {/* Mobile FAB */}
      <button
        onClick={() => setMobileAddOpen(true)}
        className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white transition active:scale-90 md:hidden no-select"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 76px)",
          boxShadow: "var(--shadow-accent)",
        }}
        aria-label="Ajouter une tâche"
      >
        <Icon name="plus" size={26} />
      </button>

      {/* Bottom nav (mobile only) */}
      <BottomNav
        view={view}
        onViewChange={navigate}
        onOpenMore={() => setSidebarOpen(true)}
      />

      <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        onOpenTask={setOpenTaskId}
      />

      <MobileQuickAdd open={mobileAddOpen} onClose={() => setMobileAddOpen(false)} view={view} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <TodayPicker open={todayPickerOpen} onClose={() => setTodayPickerOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DailyPlan open={planOpen} onClose={() => setPlanOpen(false)} />
      <AssistantChat open={chatOpen} onClose={() => setChatOpen(false)} />
      <PomodoroWidget />
      <Notifications />
      <InstallPrompt />
    </div>
  );
}

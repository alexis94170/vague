"use client";

import { useMemo, useState } from "react";
import { useStore } from "../store";
import { filterTasks, ViewKind } from "../lib/views";
import { PRIORITY_ORDER, Task, Priority } from "../lib/types";
import { todayISO, addDays } from "../lib/dates";
import TaskRow from "./TaskRow";
import Icon from "./Icon";

type Props = {
  view: ViewKind;
  onOpenTask: (id: string) => void;
};

type Group = { label: string; tone?: string; tasks: Task[] };

function groupByDate(tasks: Task[]): Group[] {
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const end = addDays(today, 7);
  const overdue: Task[] = [];
  const todayList: Task[] = [];
  const tomorrowList: Task[] = [];
  const thisWeek: Task[] = [];
  const later: Task[] = [];
  const noDate: Task[] = [];

  tasks.forEach((t) => {
    if (!t.dueDate) return noDate.push(t);
    if (t.dueDate < today) return overdue.push(t);
    if (t.dueDate === today) return todayList.push(t);
    if (t.dueDate === tomorrow) return tomorrowList.push(t);
    if (t.dueDate <= end) return thisWeek.push(t);
    later.push(t);
  });

  const groups: Group[] = [];
  if (overdue.length) groups.push({ label: "En retard", tone: "text-rose-500", tasks: overdue });
  if (todayList.length) groups.push({ label: "Aujourd'hui", tone: "text-amber-500", tasks: todayList });
  if (tomorrowList.length) groups.push({ label: "Demain", tasks: tomorrowList });
  if (thisWeek.length) groups.push({ label: "Cette semaine", tasks: thisWeek });
  if (later.length) groups.push({ label: "Plus tard", tasks: later });
  if (noDate.length) groups.push({ label: "Sans date", tasks: noDate });
  return groups;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority];
    const pb = PRIORITY_ORDER[b.priority];
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export default function TaskList({ view, onOpenTask }: Props) {
  const { tasks, projects, patchTasks, deleteTasks, snoozeTask, clearCompleted } = useStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => filterTasks(tasks, view), [tasks, view]);

  const groups: Group[] = useMemo(() => {
    if (view.kind === "today" || view.kind === "untriaged") {
      return [{ label: "", tasks: sortTasks(filtered) }];
    }
    if (view.kind === "waiting") {
      const map = new Map<string, Task[]>();
      filtered.forEach((t) => {
        const k = t.waitingFor?.trim() || "__none__";
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(t);
      });
      return Array.from(map.entries())
        .sort(([a], [b]) => (a === "__none__" ? 1 : b === "__none__" ? -1 : a.localeCompare(b)))
        .map(([k, ts]) => ({
          label: k === "__none__" ? "Sans précision" : k,
          tone: "text-amber-600",
          tasks: sortTasks(ts),
        }));
    }
    if (view.kind === "completed") {
      const sorted = [...filtered].sort((a, b) =>
        (b.doneAt ?? "").localeCompare(a.doneAt ?? "")
      );
      return [{ label: "", tasks: sorted }];
    }
    return groupByDate(filtered).map((g) => ({ ...g, tasks: sortTasks(g.tasks) }));
  }, [filtered, view]);

  function toggleSelect(id: string, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && next.size > 0) {
        const flat = groups.flatMap((g) => g.tasks.map((t) => t.id));
        const last = Array.from(next).pop()!;
        const i1 = flat.indexOf(last);
        const i2 = flat.indexOf(id);
        if (i1 >= 0 && i2 >= 0) {
          const [from, to] = i1 < i2 ? [i1, i2] : [i2, i1];
          for (let i = from; i <= to; i++) next.add(flat[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const selectedIds = Array.from(selected);
  const hasSelection = selectedIds.length > 0;
  const isEmpty = groups.length === 0 || groups.every((g) => g.tasks.length === 0);

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elev)]">
      {hasSelection && (
        <div className="sticky top-[84px] z-10 flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elev)]/95 px-4 py-2.5 text-[12px] backdrop-blur">
          <span className="font-medium text-[var(--text)]">
            {selectedIds.length} sélectionnée{selectedIds.length > 1 ? "s" : ""}
          </span>
          <BulkMenu
            onSetPriority={(p) => patchTasks(selectedIds, { priority: p })}
            onSetProject={(pid) => patchTasks(selectedIds, { projectId: pid || undefined })}
            onSetDueDate={(iso) => patchTasks(selectedIds, { dueDate: iso || undefined })}
            onSnooze={(days) => {
              const target = addDays(todayISO(), days);
              selectedIds.forEach((id) => snoozeTask(id, target));
            }}
            onWait={() => {
              const reason = prompt("En attente de quoi / qui ? (optionnel)") ?? "";
              patchTasks(selectedIds, { waiting: true, waitingFor: reason.trim() || undefined });
            }}
            onResume={() => patchTasks(selectedIds, { waiting: false, waitingFor: undefined })}
            onDelete={() => {
              if (confirm(`Supprimer ${selectedIds.length} tâche(s) ?`)) {
                deleteTasks(selectedIds);
                clearSelection();
              }
            }}
            projects={projects}
          />
          <button
            onClick={clearSelection}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          >
            <Icon name="x" size={12} />
            Désélectionner
          </button>
        </div>
      )}

      {view.kind === "completed" && filtered.length > 0 && (
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[11.5px]">
          <button
            onClick={() => {
              if (confirm(`Supprimer définitivement ${filtered.length} tâche(s) terminée(s) ?`)) {
                clearCompleted();
              }
            }}
            className="flex items-center gap-1.5 text-rose-600 hover:underline"
          >
            <Icon name="trash" size={12} />
            Vider toutes les terminées ({filtered.length})
          </button>
        </div>
      )}

      {isEmpty ? (
        <EmptyState view={view} totalTasks={tasks.length} />
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {groups.map((g, i) => (
            <section key={i} className="anim-fade-in">
              {g.label && (
                <header className="flex items-center justify-between bg-[var(--bg)]/50 px-4 py-2">
                  <h3 className={`text-[10.5px] font-semibold uppercase tracking-wider ${g.tone ?? "text-[var(--text-muted)]"}`}>
                    {g.label}
                  </h3>
                  <span className="text-[10.5px] tabular-nums text-[var(--text-subtle)]">{g.tasks.length}</span>
                </header>
              )}
              <div className="divide-y divide-[var(--border)]/50">
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    selected={selected.has(t.id)}
                    onToggleSelect={toggleSelect}
                    onOpen={onOpenTask}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ view, totalTasks }: { view: ViewKind; totalTasks: number }) {
  const messages: Record<string, { title: string; sub: string }> = {
    today: totalTasks === 0
      ? { title: "Commence avec ta première tâche", sub: "Tape au-dessus ou importe ton fichier Excel." }
      : { title: "Rien d'urgent aujourd'hui", sub: "Tout est sous contrôle. Profite de la pause." },
    all: totalTasks === 0
      ? { title: "Encore rien à faire", sub: "Ajoute une tâche pour commencer." }
      : { title: "Aucune tâche active", sub: "Tout est terminé — beau travail." },
    untriaged: { title: "Rien à trier", sub: "Les tâches ajoutées sans projet atterrissent ici, prêtes à être rangées." },
    waiting: { title: "Aucune tâche en attente", sub: "Mets une tâche en pause si tu attends un retour, une livraison, une réponse…" },
    completed: { title: "Aucune tâche terminée", sub: "Coche tes tâches, elles s'archiveront ici." },
    project: { title: "Ce projet est vide", sub: "Ajoute une tâche à ce projet avec le champ au-dessus." },
    tag: { title: "Aucune tâche avec ce tag", sub: "Ajoute ce tag à tes tâches pour les regrouper." },
    search: { title: "Aucun résultat", sub: "Essaie d'autres mots-clés." },
  };
  const msg = messages[view.kind] || { title: "Rien à afficher", sub: "" };
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center anim-fade-in">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-hover)] text-[var(--text-subtle)]">
        <Icon name={view.kind === "completed" ? "check" : view.kind === "today" ? "sun" : "inbox"} size={22} />
      </div>
      <h3 className="text-[14px] font-medium text-[var(--text)]">{msg.title}</h3>
      <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">{msg.sub}</p>
    </div>
  );
}

function BulkMenu({
  onSetPriority,
  onSetProject,
  onSetDueDate,
  onSnooze,
  onWait,
  onResume,
  onDelete,
  projects,
}: {
  onSetPriority: (p: Priority) => void;
  onSetProject: (pid: string) => void;
  onSetDueDate: (iso: string) => void;
  onSnooze: (days: number) => void;
  onWait: () => void;
  onResume: () => void;
  onDelete: () => void;
  projects: Array<{ id: string; name: string }>;
}) {
  const selectCls = "rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11.5px] outline-none hover:border-[var(--border-strong)]";
  const btnCls = "rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11.5px] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select onChange={(e) => e.target.value && onSetPriority(e.target.value as Priority)} defaultValue="" className={selectCls}>
        <option value="">Priorité…</option>
        <option value="urgent">Urgente</option>
        <option value="high">Haute</option>
        <option value="medium">Moyenne</option>
        <option value="low">Basse</option>
        <option value="none">Aucune</option>
      </select>
      <select
        onChange={(e) => {
          if (e.target.value) onSetProject(e.target.value === "__none__" ? "" : e.target.value);
        }}
        defaultValue=""
        className={selectCls}
      >
        <option value="">Projet…</option>
        <option value="__none__">Aucun</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <input type="date" onChange={(e) => onSetDueDate(e.target.value)} className={selectCls} />
      <button onClick={() => onSnooze(1)} className={btnCls}>+1 j</button>
      <button onClick={() => onSnooze(3)} className={btnCls}>+3 j</button>
      <button onClick={() => onSnooze(7)} className={btnCls}>+1 sem</button>
      <button
        onClick={onWait}
        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11.5px] text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
      >
        En attente
      </button>
      <button onClick={onResume} className={btnCls} title="Sortir de l'attente">Reprendre</button>
      <button onClick={onDelete} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50">
        Supprimer
      </button>
    </div>
  );
}

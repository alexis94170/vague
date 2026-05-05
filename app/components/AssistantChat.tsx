"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useGoogle } from "../google";
import { aiChat, aiBreakdown, ChatEvent } from "../lib/ai-client";
import { autoSchedule, clampToNow, findFreeSlots, formatHourMinute, workDayWindow } from "../lib/calendar-utils";
import { addDays, todayISO } from "../lib/dates";
import { eventEnd, eventStart, isAllDay, createCalendarEvent } from "../lib/google-client";
import { haptic } from "../lib/haptics";
import { Priority, Subtask, Task } from "../lib/types";
import { newId } from "../lib/storage";
import Icon from "./Icon";
import VoiceButton from "./VoiceButton";

type Msg = {
  role: "user" | "assistant";
  content: string;
  actions?: Array<{ name: string; summary: string }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const SUGGESTIONS = [
  "Qu'est-ce que je fais en priorité aujourd'hui ?",
  "Quelles tâches sont en retard ?",
  "Ajoute « commander du papier toilette » en urgent pour Indiana Café",
  "Reporte toutes mes tâches basses à la semaine prochaine",
];

function friendlyActionSummary(name: string, input: Record<string, unknown>, lookup: (id: string) => string | undefined, projectLookup: (id: string) => string | undefined): string {
  switch (name) {
    case "create_task": {
      const title = String(input.title ?? "");
      const prio = input.priority && input.priority !== "none" ? ` (${input.priority})` : "";
      return `➕ Tâche créée · « ${title} »${prio}`;
    }
    case "update_task": {
      const title = lookup(String(input.taskId ?? "")) ?? "tâche";
      return `✎ Modifiée · « ${title} »`;
    }
    case "complete_tasks": {
      const ids = (input.taskIds as string[]) ?? [];
      if (ids.length === 1) return `✓ Terminée · « ${lookup(ids[0]) ?? "tâche"} »`;
      return `✓ ${ids.length} tâches terminées`;
    }
    case "delete_tasks": {
      const ids = (input.taskIds as string[]) ?? [];
      if (ids.length === 1) return `🗑 Supprimée · « ${lookup(ids[0]) ?? "tâche"} » (dans la corbeille)`;
      return `🗑 ${ids.length} tâches supprimées (dans la corbeille)`;
    }
    case "reschedule_tasks": {
      const ids = (input.taskIds as string[]) ?? [];
      const date = String(input.dueDate ?? "");
      if (ids.length === 1) return `📅 « ${lookup(ids[0]) ?? "tâche"} » → ${date}`;
      return `📅 ${ids.length} tâches reportées au ${date}`;
    }
    case "create_project": {
      return `📁 Projet créé · « ${String(input.name ?? "")} »`;
    }
    case "rename_project": {
      const old = projectLookup(String(input.projectId ?? "")) ?? "projet";
      return `📁 Renommé · « ${old} » → « ${String(input.newName ?? "")} »`;
    }
    case "recolor_project": {
      const name = projectLookup(String(input.projectId ?? "")) ?? "projet";
      return `🎨 Couleur du projet « ${name} » mise à jour`;
    }
    case "delete_project": {
      const name = projectLookup(String(input.projectId ?? "")) ?? "projet";
      return `🗑 Projet « ${name} » supprimé`;
    }
    case "auto_schedule": {
      const ids = (input.taskIds as string[]) ?? [];
      const date = String(input.date ?? "aujourd'hui");
      return `🌊 ${ids.length} tâche${ids.length > 1 ? "s" : ""} planifiée${ids.length > 1 ? "s" : ""} pour ${date}`;
    }
    case "break_down_task": {
      const id = String(input.taskId ?? "");
      const title = lookup(id) ?? "tâche";
      return `✦ Décomposition · « ${title} »`;
    }
    case "block_calendar": {
      const id = String(input.taskId ?? "");
      const title = lookup(id) ?? "tâche";
      return `📅 Bloqué dans l'agenda · « ${title} »`;
    }
  }
  return `Action : ${name}`;
}

export default function AssistantChat({ open, onClose }: Props) {
  const store = useStore();
  const { tasks, projects } = store;
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("vague:chat:v1");
      return raw ? (JSON.parse(raw) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist chat history
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Keep last 30 messages to avoid bloat
      const trimmed = messages.slice(-30);
      localStorage.setItem("vague:chat:v1", JSON.stringify(trimmed));
    } catch {}
  }, [messages]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);
  useEffect(() => { if (!open) abortRef.current?.abort(); }, [open]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function titleLookup(id: string): string | undefined {
    return tasks.find((t) => t.id === id)?.title;
  }
  function projectNameLookup(id: string): string | undefined {
    return projects.find((p) => p.id === id)?.name;
  }

  const google = useGoogle();

  async function executeTool(name: string, input: Record<string, unknown>): Promise<boolean> {
    try {
      switch (name) {
        case "create_task": {
          store.addTask({
            title: String(input.title ?? "Sans titre"),
            priority: (input.priority as Priority | undefined) ?? "none",
            projectId: input.projectId ? String(input.projectId) : undefined,
            tags: (input.tags as string[] | undefined) ?? [],
            dueDate: input.dueDate ? String(input.dueDate) : undefined,
            dueTime: input.dueTime ? String(input.dueTime) : undefined,
            estimateMinutes: input.estimateMinutes ? Number(input.estimateMinutes) : undefined,
            notes: input.notes ? String(input.notes) : undefined,
          });
          return true;
        }
        case "update_task": {
          const id = String(input.taskId ?? "");
          const patch = (input.patch as Partial<Task>) ?? {};
          if (!id) return false;
          store.patchTask(id, patch);
          return true;
        }
        case "complete_tasks": {
          const ids = (input.taskIds as string[]) ?? [];
          ids.forEach((id) => {
            const t = tasks.find((x) => x.id === id);
            if (t && !t.done) store.toggleDone(id);
          });
          return true;
        }
        case "delete_tasks": {
          const ids = (input.taskIds as string[]) ?? [];
          if (ids.length > 0) store.deleteTasks(ids);
          return true;
        }
        case "reschedule_tasks": {
          const ids = (input.taskIds as string[]) ?? [];
          const date = String(input.dueDate ?? "");
          if (ids.length > 0 && date) store.patchTasks(ids, { dueDate: date });
          return true;
        }
        case "create_project": {
          const name = String(input.name ?? "").trim();
          if (!name) return false;
          const p = store.addProject(name);
          if (input.color) store.recolorProject(p.id, String(input.color));
          return true;
        }
        case "rename_project": {
          const id = String(input.projectId ?? "");
          const name = String(input.newName ?? "").trim();
          if (!id || !name) return false;
          store.renameProject(id, name);
          return true;
        }
        case "recolor_project": {
          const id = String(input.projectId ?? "");
          const color = String(input.color ?? "");
          if (!id || !color) return false;
          store.recolorProject(id, color);
          return true;
        }
        case "delete_project": {
          const id = String(input.projectId ?? "");
          if (!id || id === "inbox") return false;
          store.deleteProject(id);
          return true;
        }
        case "auto_schedule": {
          const ids = (input.taskIds as string[]) ?? [];
          const date = String(input.date ?? todayISO());
          if (ids.length === 0) return false;
          const tasksToSchedule = ids
            .map((id) => tasks.find((t) => t.id === id))
            .filter((t): t is Task => !!t);
          // Compute slots for that day
          const dayEvents = google.eventsForDate(date);
          const baseWin = workDayWindow(date);
          const win = clampToNow(baseWin, date);
          const slots = findFreeSlots(dayEvents, win.start, win.end, 15);
          const { scheduled } = autoSchedule(tasksToSchedule, slots, 5);
          store.patchTasks(ids, { dueDate: date });
          for (const s of scheduled) {
            const time = `${String(s.start.getHours()).padStart(2, "0")}:${String(s.start.getMinutes()).padStart(2, "0")}`;
            store.patchTask(s.taskId, { dueTime: time });
          }
          return true;
        }
        case "break_down_task": {
          const id = String(input.taskId ?? "");
          const task = tasks.find((t) => t.id === id);
          if (!task) return false;
          // Run breakdown async, add subtasks when done
          aiBreakdown({
            title: task.title,
            notes: task.notes,
            projectName: projects.find((p) => p.id === task.projectId)?.name,
            estimateMinutes: task.estimateMinutes,
          })
            .then((r) => {
              const newSubs: Subtask[] = [...task.subtasks];
              for (const section of r.sections) {
                for (const step of section.steps) {
                  newSubs.push({
                    id: newId(),
                    title: step.title,
                    done: false,
                    section: section.name || undefined,
                  });
                }
              }
              store.patchTask(id, {
                subtasks: newSubs,
                tags: Array.from(new Set([...task.tags, ...(r.tags ?? [])])),
              });
            })
            .catch((e) => console.error("Inline breakdown failed:", e));
          return true;
        }
        case "block_calendar": {
          if (!google.isConnected) return false;
          const id = String(input.taskId ?? "");
          const task = tasks.find((t) => t.id === id);
          if (!task) return false;
          const dueDate = String(input.dueDate ?? task.dueDate ?? todayISO());
          const dueTime = String(input.dueTime ?? task.dueTime ?? "09:00");
          const duration = Number(input.estimateMinutes ?? task.estimateMinutes ?? 30);
          // Update task with these values too
          store.patchTask(id, { dueDate, dueTime, estimateMinutes: duration });
          const startDate = new Date(`${dueDate}T${dueTime}:00`);
          const endDate = new Date(startDate.getTime() + duration * 60_000);
          createCalendarEvent({
            summary: task.title,
            description: task.notes,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          })
            .then(() => google.refresh())
            .catch((e) => console.error("block_calendar failed:", e));
          return true;
        }
      }
    } catch (e) {
      console.error("tool exec failed:", e);
    }
    return false;
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const userMsg: Msg = { role: "user", content };
    const assistantMsg: Msg = { role: "assistant", content: "", actions: [] };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setError(null);
    setLoading(true);
    haptic("light");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Build calendar context
      const today = todayISO();
      const eventsCtx = google.events.slice(0, 60).map((e) => {
        const start = eventStart(e);
        const end = eventEnd(e);
        const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const y = start.getFullYear();
        const m = String(start.getMonth() + 1).padStart(2, "0");
        const d = String(start.getDate()).padStart(2, "0");
        return {
          date: `${y}-${m}-${d}`,
          start: isAllDay(e) ? "all-day" : fmt(start),
          end: isAllDay(e) ? "all-day" : fmt(end),
          summary: e.summary || "(Sans titre)",
          calendar: e.__calendarName ?? undefined,
        };
      });
      const todayEvents = google.eventsForDate(today);
      const baseWin = workDayWindow(today);
      const win = clampToNow(baseWin, today);
      const todaySlots = findFreeSlots(todayEvents, win.start, win.end, 15).map((s) => ({
        date: today,
        start: formatHourMinute(s.start),
        end: formatHourMinute(s.end),
        minutes: s.minutes,
      }));

      await aiChat(
        [...messages, userMsg],
        tasks,
        projects,
        (event: ChatEvent) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last.role !== "assistant") return prev;
            if (event.type === "text") {
              next[next.length - 1] = { ...last, content: last.content + event.text };
            } else if (event.type === "tool") {
              executeTool(event.name, event.input).then((ok) => {
                if (ok) {
                  haptic("success");
                  const summary = friendlyActionSummary(event.name, event.input, titleLookup, projectNameLookup);
                  setMessages((prev2) => {
                    const next2 = [...prev2];
                    const last2 = next2[next2.length - 1];
                    if (last2.role !== "assistant") return prev2;
                    next2[next2.length - 1] = {
                      ...last2,
                      actions: [...(last2.actions ?? []), { name: event.name, summary }],
                    };
                    return next2;
                  });
                }
              });
            } else if (event.type === "error") {
              next[next.length - 1] = { ...last, content: last.content + `\n⚠ ${event.error}` };
            }
            return next;
          });
        },
        controller.signal,
        { events: eventsCtx, freeSlotsToday: todaySlots, hasGoogleConnected: google.isConnected }
      );
      haptic("light");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
      haptic("warning");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setError(null);
    if (typeof window !== "undefined") {
      try { localStorage.removeItem("vague:chat:v1"); } catch {}
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 anim-fade-in sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-[var(--bg-elev)] shadow-2xl anim-scale-in sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-[var(--border)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 safe-top">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
              <Icon name="sparkles" size={14} />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight">Assistant Vague</h2>
              <div className="text-[11px] text-[var(--text-muted)]">Peut créer, cocher, reporter tes tâches directement</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button onClick={reset} className="rounded-md px-2 py-1 text-[11.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">Nouveau</button>
            )}
            <button onClick={onClose} className="tappable flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="text-[13px] text-[var(--text-muted)]">
                  Je peux maintenant <strong className="text-[var(--text)]">agir</strong> sur tes tâches. Demande-moi d&apos;ajouter, cocher, reporter, supprimer — c&apos;est fait.
                </div>
              </div>
              <div className="space-y-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="flex w-full items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-left text-[13px] text-[var(--text)] transition hover:border-[var(--accent)]/30 hover:bg-[var(--accent-soft)]"
                  >
                    <Icon name="sparkles" size={13} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                    {m.content && (
                      <div className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                        m.role === "user" ? "bg-[var(--accent)] text-white" : "bg-[var(--bg)] text-[var(--text)]"
                      }`}>
                        {m.content || (loading && i === messages.length - 1 ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-50" />
                            <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-50" style={{ animationDelay: "150ms" }} />
                            <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-50" style={{ animationDelay: "300ms" }} />
                          </span>
                        ) : "")}
                      </div>
                    )}
                    {!m.content && loading && i === messages.length - 1 && (!m.actions || m.actions.length === 0) && (
                      <div className="rounded-2xl bg-[var(--bg)] px-4 py-2.5 text-[14px]">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-50" />
                          <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-50" style={{ animationDelay: "150ms" }} />
                          <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-50" style={{ animationDelay: "300ms" }} />
                        </span>
                      </div>
                    )}
                    {m.actions && m.actions.length > 0 && (
                      <div className="space-y-1">
                        {m.actions.map((a, j) => (
                          <div key={j} className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-1 text-[11.5px] font-medium text-[var(--accent)]">
                            {a.summary}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3 safe-bottom"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Dis-moi ce qu'il faut faire (ou tape 🎤 pour dicter)…"
              className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--accent)]/40"
              style={{ maxHeight: 120 }}
            />
            <div className="flex items-center gap-1">
              <VoiceButton
                size="md"
                onTranscript={(text, isFinal) => {
                  if (isFinal) {
                    const merged = input.trim() ? input.trim() + " " + text : text;
                    setInput(merged);
                  }
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition active:scale-95 disabled:opacity-40"
              >
                <Icon name="arrow-right" size={16} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

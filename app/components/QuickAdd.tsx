"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { parseInput } from "../lib/parser";
import { ViewKind } from "../lib/views";
import { addDays, formatShort, todayISO, weekdayName } from "../lib/dates";
import { Priority, PRIORITY_LABEL } from "../lib/types";
import Icon from "./Icon";
import Popover from "./Popover";

type Props = { view: ViewKind; onSubmitted?: () => void; autoFocus?: boolean };

const PRIORITY_DOT: Record<Priority, string> = {
  urgent: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
  none: "bg-[var(--text-subtle)]/40",
};

export default function QuickAdd({ view, onSubmitted, autoFocus }: Props) {
  const { projects, addTaskFromParsed, addProject, allTags } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [dueTime, setDueTime] = useState<string | undefined>();
  const [priority, setPriority] = useState<Priority>("none");
  const [projectId, setProjectId] = useState<string | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [estimate, setEstimate] = useState<number | undefined>();

  const [openDate, setOpenDate] = useState(false);
  const [openProject, setOpenProject] = useState(false);
  const [openPriority, setOpenPriority] = useState(false);
  const [openTags, setOpenTags] = useState(false);
  const [openEst, setOpenEst] = useState(false);

  useEffect(() => {
    if (view.kind === "today") setDueDate(todayISO());
    else setDueDate(undefined);
    if (view.kind === "project") setProjectId(view.id);
    else setProjectId(undefined);
    if (view.kind === "tag") setTags([view.tag]);
    else setTags([]);
  }, [view.kind, view.kind === "project" ? view.id : "", view.kind === "tag" ? view.tag : ""]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const parsedTokens = useMemo(() => parseInput(title, projects).tokens, [title, projects]);

  function onTitleChange(v: string) {
    setTitle(v);
    const p = parseInput(v, projects);
    if (p.dueDate) setDueDate(p.dueDate);
    if (p.dueTime) setDueTime(p.dueTime);
    if (p.priority) setPriority(p.priority);
    if (p.projectId) setProjectId(p.projectId);
    if (p.tags.length > 0) setTags((prev) => Array.from(new Set([...prev, ...p.tags])));
    if (p.estimateMinutes) setEstimate(p.estimateMinutes);
  }

  function reset() {
    setTitle("");
    if (view.kind === "today") setDueDate(todayISO());
    else setDueDate(undefined);
    setDueTime(undefined);
    setPriority("none");
    if (view.kind === "project") setProjectId(view.id);
    else setProjectId(undefined);
    if (view.kind === "tag") setTags([view.tag]);
    else setTags([]);
    setEstimate(undefined);
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const cleanTitle = parsedTokens.reduce((acc, t) => acc.replace(t.raw, ""), title).replace(/\s+/g, " ").trim();
    if (!cleanTitle) return;
    addTaskFromParsed(
      {
        title: cleanTitle,
        dueDate,
        dueTime,
        priority: priority === "none" ? undefined : priority,
        projectId,
        tags,
        estimateMinutes: estimate,
        tokens: [],
      },
      projectId
    );
    reset();
    if (onSubmitted) onSubmitted();
    else inputRef.current?.focus();
  }

  const project = projects.find((p) => p.id === projectId);

  return (
    <form
      onSubmit={submit}
      className="overflow-visible rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] shadow-sm transition hover:border-[var(--border-strong)] focus-within:border-[var(--accent)]/40 focus-within:shadow-[0_0_0_4px_var(--accent-soft)]"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon name="plus" size={16} className="text-[var(--text-subtle)]" />
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ajouter une tâche…"
          className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-subtle)]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] bg-[var(--bg)] px-3 py-2">
        <Pill
          active={!!dueDate}
          icon="calendar"
          label={dueDate ? dateLabel(dueDate, dueTime) : "Date"}
          onClick={() => setOpenDate(!openDate)}
          onClear={dueDate ? () => { setDueDate(undefined); setDueTime(undefined); } : undefined}
        >
          <Popover open={openDate} onClose={() => setOpenDate(false)}>
            <DatePopover
              value={dueDate}
              time={dueTime}
              onChange={(d, t) => { setDueDate(d); setDueTime(t); setOpenDate(false); }}
            />
          </Popover>
        </Pill>

        <Pill
          active={!!projectId}
          icon="inbox"
          label={project ? project.name : "Projet"}
          color={project?.color}
          onClick={() => setOpenProject(!openProject)}
          onClear={projectId ? () => setProjectId(undefined) : undefined}
        >
          <Popover open={openProject} onClose={() => setOpenProject(false)}>
            <ProjectPopover
              projects={projects}
              selected={projectId}
              onSelect={(id) => { setProjectId(id); setOpenProject(false); }}
              onCreate={(name) => {
                const p = addProject(name);
                setProjectId(p.id);
                setOpenProject(false);
              }}
            />
          </Popover>
        </Pill>

        <Pill
          active={priority !== "none"}
          icon="flag"
          label={priority === "none" ? "Priorité" : PRIORITY_LABEL[priority]}
          dotClass={priority !== "none" ? PRIORITY_DOT[priority] : undefined}
          onClick={() => setOpenPriority(!openPriority)}
          onClear={priority !== "none" ? () => setPriority("none") : undefined}
        >
          <Popover open={openPriority} onClose={() => setOpenPriority(false)}>
            <PriorityPopover
              value={priority}
              onChange={(p) => { setPriority(p); setOpenPriority(false); }}
            />
          </Popover>
        </Pill>

        <Pill
          active={tags.length > 0}
          icon="tag"
          label={tags.length > 0 ? tags.map((t) => `#${t}`).join(" ") : "Tags"}
          onClick={() => setOpenTags(!openTags)}
          onClear={tags.length > 0 ? () => setTags([]) : undefined}
        >
          <Popover open={openTags} onClose={() => setOpenTags(false)}>
            <TagsPopover
              value={tags}
              suggestions={allTags}
              onChange={setTags}
              onClose={() => setOpenTags(false)}
            />
          </Popover>
        </Pill>

        <Pill
          active={!!estimate}
          icon="clock"
          label={estimate ? formatMin(estimate) : "Durée"}
          onClick={() => setOpenEst(!openEst)}
          onClear={estimate ? () => setEstimate(undefined) : undefined}
        >
          <Popover open={openEst} onClose={() => setOpenEst(false)}>
            <EstimatePopover
              value={estimate}
              onChange={(n) => { setEstimate(n); setOpenEst(false); }}
            />
          </Popover>
        </Pill>

        <button
          type="submit"
          disabled={!title.trim()}
          className="ml-auto rounded-md bg-[var(--accent)] px-3 py-1 text-[12px] font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
    </form>
  );
}

function Pill({
  active,
  icon,
  label,
  color,
  dotClass,
  onClick,
  onClear,
  children,
}: {
  active: boolean;
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  color?: string;
  dotClass?: string;
  onClick: () => void;
  onClear?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition ${
          active
            ? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--border)] bg-[var(--bg-elev)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        }`}
      >
        {color ? (
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        ) : dotClass ? (
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        ) : (
          <Icon name={icon} size={12} />
        )}
        <span className="max-w-[180px] truncate">{label}</span>
        {onClear && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="-mr-0.5 ml-0.5 rounded p-0.5 hover:bg-[var(--bg-hover)]"
          >
            <Icon name="x" size={10} />
          </span>
        )}
      </button>
      {children}
    </div>
  );
}

/* ============== Popovers ============== */

function DatePopover({
  value,
  time,
  onChange,
}: {
  value?: string;
  time?: string;
  onChange: (d?: string, t?: string) => void;
}) {
  const today = todayISO();
  const options: Array<{ label: string; date: string }> = [
    { label: "Aujourd'hui", date: today },
    { label: "Demain", date: addDays(today, 1) },
    { label: `${weekdayName(addDays(today, 2))}`, date: addDays(today, 2) },
    { label: `${weekdayName(addDays(today, 3))}`, date: addDays(today, 3) },
    { label: "Dans 1 semaine", date: addDays(today, 7) },
  ];
  return (
    <div className="w-64 p-1.5">
      {options.map((o) => (
        <button
          key={o.date}
          type="button"
          onClick={() => onChange(o.date, time)}
          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] transition hover:bg-[var(--bg-hover)] ${
            value === o.date ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""
          }`}
        >
          <span>{o.label}</span>
          <span className="text-[11px] text-[var(--text-subtle)]">{formatShort(o.date)}</span>
        </button>
      ))}
      <div className="my-1 border-t border-[var(--border)]" />
      <div className="flex items-center gap-2 px-2 py-1.5">
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined, time)}
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12px] outline-none"
        />
        <input
          type="time"
          value={time ?? ""}
          onChange={(e) => onChange(value, e.target.value || undefined)}
          className="w-24 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12px] outline-none"
        />
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined, undefined)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
        >
          <Icon name="x" size={12} />
          Retirer la date
        </button>
      )}
    </div>
  );
}

function ProjectPopover({
  projects,
  selected,
  onSelect,
  onCreate,
}: {
  projects: Array<{ id: string; name: string; color: string }>;
  selected?: string;
  onSelect: (id?: string) => void;
  onCreate: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q.trim().length > 0 && !projects.some((p) => p.name.toLowerCase() === q.trim().toLowerCase());
  return (
    <div className="w-64 p-1.5">
      <div className="px-1 pb-1">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher ou créer…"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12px] outline-none"
        />
      </div>
      <div className="max-h-60 overflow-y-auto">
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] hover:bg-[var(--bg-hover)] ${
            !selected ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""
          }`}
        >
          <Icon name="inbox" size={12} />
          Aucun projet
        </button>
        {filtered.filter((p) => p.id !== "inbox").map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] hover:bg-[var(--bg-hover)] ${
              selected === p.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        {canCreate && (
          <button
            type="button"
            onClick={() => onCreate(q.trim())}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-[var(--accent)] hover:bg-[var(--bg-hover)]"
          >
            <Icon name="plus" size={12} />
            Créer « {q.trim()} »
          </button>
        )}
      </div>
    </div>
  );
}

function PriorityPopover({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
}) {
  const options: Array<{ p: Priority; label: string; desc: string }> = [
    { p: "urgent", label: "Urgente", desc: "À faire tout de suite" },
    { p: "high", label: "Haute", desc: "Important, bientôt" },
    { p: "medium", label: "Moyenne", desc: "À planifier" },
    { p: "low", label: "Basse", desc: "Si le temps" },
    { p: "none", label: "Aucune", desc: "Pas de priorité" },
  ];
  return (
    <div className="w-56 p-1.5">
      {options.map((o) => (
        <button
          key={o.p}
          type="button"
          onClick={() => onChange(o.p)}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition hover:bg-[var(--bg-hover)] ${
            value === o.p ? "bg-[var(--accent-soft)]" : ""
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[o.p]}`} />
          <span className="flex-1">
            <span className="font-medium">{o.label}</span>
            <span className="ml-2 text-[11px] text-[var(--text-subtle)]">{o.desc}</span>
          </span>
          {value === o.p && <Icon name="check" size={12} className="text-[var(--accent)]" />}
        </button>
      ))}
    </div>
  );
}

function TagsPopover({
  value,
  suggestions,
  onChange,
  onClose,
}: {
  value: string[];
  suggestions: string[];
  onChange: (t: string[]) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  function add(tag: string) {
    const t = tag.trim().replace(/^[#@]/, "");
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setInput("");
  }
  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }
  const filtered = suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase()));
  return (
    <div className="w-64 p-1.5">
      {value.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1 px-1 pb-1">
          {value.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-md bg-teal-500/10 px-1.5 py-0.5 text-[11px] text-teal-600 dark:text-teal-300">
              #{t}
              <button type="button" onClick={() => remove(t)} className="text-teal-700/60 hover:text-teal-800 dark:text-teal-300/60">
                <Icon name="x" size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (input.trim()) add(input);
            else onClose();
          }
        }}
        placeholder="Chercher ou créer un tag…"
        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12px] outline-none"
      />
      <div className="mt-1 max-h-40 overflow-y-auto">
        {filtered.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] hover:bg-[var(--bg-hover)]"
          >
            <span className="text-[var(--text-subtle)]">#</span>
            {s}
          </button>
        ))}
        {input.trim() && !suggestions.includes(input.trim()) && !value.includes(input.trim()) && (
          <button
            type="button"
            onClick={() => add(input)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-[var(--accent)] hover:bg-[var(--bg-hover)]"
          >
            <Icon name="plus" size={12} />
            Créer #{input.trim()}
          </button>
        )}
      </div>
    </div>
  );
}

function EstimatePopover({
  value,
  onChange,
}: {
  value?: number;
  onChange: (n?: number) => void;
}) {
  const quick = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240];
  return (
    <div className="w-60 p-1.5">
      <div className="grid grid-cols-5 gap-1 px-1 pb-1">
        {quick.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`rounded-md border px-1.5 py-1 text-[11px] transition ${
              value === n
                ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            {formatMin(n)}
          </button>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-2 px-1">
        <input
          type="number"
          min={0}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : undefined)}
          placeholder="min"
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12px] outline-none"
        />
        <span className="text-[11px] text-[var(--text-subtle)]">minutes</span>
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
        >
          <Icon name="x" size={12} />
          Retirer
        </button>
      )}
    </div>
  );
}

/* ============== helpers ============== */

function dateLabel(d: string, time?: string): string {
  const today = todayISO();
  const diff = (new Date(d + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000;
  const base =
    diff === 0 ? "Aujourd'hui" :
    diff === 1 ? "Demain" :
    diff === -1 ? "Hier" :
    diff > 0 && diff < 7 ? weekdayName(d) :
    formatShort(d);
  return time ? `${base} · ${time}` : base;
}

function formatMin(n: number): string {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, "0")}`;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { parseInput } from "../lib/parser";
import type { Task } from "../lib/types";
import { ViewKind } from "../lib/views";
import { addDays, formatShort, todayISO, weekdayName } from "../lib/dates";
import { Priority, PRIORITY_LABEL } from "../lib/types";
import { haptic } from "../lib/haptics";
import Icon, { IconName } from "./Icon";
import VoiceButton from "./VoiceButton";

type Props = {
  open: boolean;
  onClose: () => void;
  view: ViewKind;
};

const PRIORITY_DOT: Record<Priority, string> = {
  urgent: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
  none: "bg-[var(--text-subtle)]/40",
};

type SheetKind = null | "date" | "project" | "priority" | "tags" | "estimate";

export default function MobileQuickAdd({ open, onClose, view }: Props) {
  const { projects, addTask, addProject, allTags } = useStore();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [dueTime, setDueTime] = useState<string | undefined>();
  const [priority, setPriority] = useState<Priority>("none");
  const [projectId, setProjectId] = useState<string | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [estimate, setEstimate] = useState<number | undefined>();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Init defaults from current view each time the sheet opens
  useEffect(() => {
    if (!open) return;
    setDueDate(undefined);
    if (view.kind === "project") setProjectId(view.id);
    else setProjectId(undefined);
    if (view.kind === "tag") setTags([view.tag]);
    else setTags([]);
    setTitle("");
    setNotes("");
    setDueTime(undefined);
    setPriority("none");
    setEstimate(undefined);
    setSheet(null);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [open, view.kind, view.kind === "project" ? view.id : "", view.kind === "tag" ? view.tag : ""]);

  // Handle keyboard via visualViewport — keep layout glued above keyboard
  useEffect(() => {
    if (!open) return;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const handler = () => {
      const h = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
      setKeyboardHeight(h);
    };
    handler();
    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);
    return () => {
      vv.removeEventListener("resize", handler);
      vv.removeEventListener("scroll", handler);
    };
  }, [open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (sheet) setSheet(null);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sheet, onClose]);

  const parsed = useMemo(() => parseInput(title, projects), [title, projects]);

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

  function submit() {
    const cleanTitle = parsed.tokens.reduce((acc, t) => acc.replace(t.raw, ""), title).replace(/\s+/g, " ").trim();
    if (!cleanTitle) return;
    const payload: Partial<Task> & { title: string } = {
      title: cleanTitle,
      notes: notes.trim() || undefined,
      dueDate,
      dueTime,
      priority,
      projectId,
      tags,
      estimateMinutes: estimate,
    };
    addTask(payload);
    haptic("success");
    onClose();
  }

  const project = projects.find((p) => p.id === projectId);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-[var(--bg)] anim-fade-in md:hidden">
      {/* Header */}
      <header className="glass flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2 pt-safe">
        <button
          onClick={onClose}
          className="tappable no-select flex items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--bg-hover)]"
          aria-label="Annuler"
        >
          <Icon name="x" size={20} />
        </button>
        <h2 className="text-[15px] font-semibold">Nouvelle tâche</h2>
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="no-select rounded-full bg-[var(--accent)] px-4 py-1.5 text-[13px] font-semibold text-[var(--bg)] transition active:scale-95 disabled:opacity-40"
        >
          OK
        </button>
      </header>

      {/* Content — stays glued above keyboard via paddingBottom */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ paddingBottom: keyboardHeight ? 0 : 16 }}
      >
        {/* Title */}
        <div className="flex items-start gap-2 border-b border-[var(--border)] bg-[var(--bg-elev)] px-4 py-3">
          <textarea
            ref={inputRef}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Qu'est-ce qu'il y a à faire ?"
            rows={2}
            className="flex-1 resize-none bg-transparent text-[17px] font-medium leading-snug outline-none placeholder:text-[var(--text-subtle)]"
          />
          <VoiceButton
            size="md"
            onTranscript={(text, isFinal) => {
              if (isFinal) {
                const merged = title.trim() ? title.trim() + " " + text : text;
                onTitleChange(merged);
              }
            }}
          />
        </div>

        {/* Pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2.5">
          <Pill
            active={!!dueDate}
            icon="calendar"
            label={dueDate ? dateLabel(dueDate, dueTime) : "Date"}
            onClick={() => setSheet("date")}
            onClear={dueDate ? () => { setDueDate(undefined); setDueTime(undefined); } : undefined}
          />
          <Pill
            active={!!projectId}
            icon="inbox"
            label={project?.name ?? "Projet"}
            color={project?.color}
            onClick={() => setSheet("project")}
            onClear={projectId ? () => setProjectId(undefined) : undefined}
          />
          <Pill
            active={priority !== "none"}
            icon="flag"
            label={priority === "none" ? "Priorité" : PRIORITY_LABEL[priority]}
            dotClass={priority !== "none" ? PRIORITY_DOT[priority] : undefined}
            onClick={() => setSheet("priority")}
            onClear={priority !== "none" ? () => setPriority("none") : undefined}
          />
          <Pill
            active={tags.length > 0}
            icon="tag"
            label={tags.length > 0 ? tags.map((t) => `#${t}`).join(" ") : "Tags"}
            onClick={() => setSheet("tags")}
            onClear={tags.length > 0 ? () => setTags([]) : undefined}
          />
          <Pill
            active={!!estimate}
            icon="clock"
            label={estimate ? formatMin(estimate) : "Durée"}
            onClick={() => setSheet("estimate")}
            onClear={estimate ? () => setEstimate(undefined) : undefined}
          />
        </div>

        {/* Notes */}
        <div className="flex-1 px-4 py-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optionnel)…"
            rows={4}
            className="w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-[var(--text-subtle)]"
          />
        </div>

        {/* Spacer to keep some room above keyboard */}
        <div style={{ height: keyboardHeight }} />
      </div>

      {/* Sub-sheets */}
      {sheet === "date" && (
        <DateSheet
          value={dueDate}
          time={dueTime}
          onChange={(d, t) => { setDueDate(d); setDueTime(t); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "project" && (
        <ProjectSheet
          projects={projects}
          selected={projectId}
          onSelect={(id) => { setProjectId(id); setSheet(null); }}
          onCreate={(name) => { const p = addProject(name); setProjectId(p.id); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "priority" && (
        <PrioritySheet
          value={priority}
          onChange={(p) => { setPriority(p); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "tags" && (
        <TagsSheet
          value={tags}
          suggestions={allTags}
          onChange={setTags}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "estimate" && (
        <EstimateSheet
          value={estimate}
          onChange={(n) => { setEstimate(n); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
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
}: {
  active: boolean;
  icon: IconName;
  label: string;
  color?: string;
  dotClass?: string;
  onClick: () => void;
  onClear?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`no-select flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition active:scale-95 ${
        active
          ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--text)] font-medium"
          : "border-[var(--border)] bg-transparent text-[var(--text-muted)]"
      }`}
    >
      {color ? (
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      ) : dotClass ? (
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      ) : (
        <Icon name={icon} size={12} />
      )}
      <span className="max-w-[160px] truncate">{label}</span>
      {onClear && (
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="-mr-1 ml-0.5 rounded-full p-0.5"
        >
          <Icon name="x" size={10} />
        </span>
      )}
    </button>
  );
}

/* ======================= Bottom sheets ======================= */

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Track viewport height to handle on-screen keyboard properly
  const [vh, setVh] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) {
      setVh(window.innerHeight);
      return;
    }
    const handler = () => setVh(vv.height);
    handler();
    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);
    return () => {
      vv.removeEventListener("resize", handler);
      vv.removeEventListener("scroll", handler);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/40 anim-fade-in" onClick={onClose}>
      <div className="flex-1" onClick={onClose} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-slide-up flex flex-col rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg-elev)] shadow-2xl"
        style={{
          maxHeight: vh ? `${vh * 0.85}px` : "80vh",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function DateSheet({
  value,
  time,
  onChange,
  onClose,
}: {
  value?: string;
  time?: string;
  onChange: (d?: string, t?: string) => void;
  onClose: () => void;
}) {
  const today = todayISO();
  // Find next saturday for "Ce week-end"
  const todayDate = new Date();
  const daysToSaturday = (6 - todayDate.getDay() + 7) % 7 || 7;
  // Find next monday
  const daysToNextMonday = ((1 - todayDate.getDay() + 7) % 7) || 7;

  const options: Array<{ label: string; date: string; time?: string; hint?: string }> = [
    { label: "Ce soir", date: today, time: "18:00", hint: "à 18h" },
    { label: "Aujourd'hui", date: today },
    { label: "Demain matin", date: addDays(today, 1), time: "09:00", hint: "à 9h" },
    { label: "Demain", date: addDays(today, 1) },
    { label: weekdayName(addDays(today, 2)), date: addDays(today, 2) },
    { label: weekdayName(addDays(today, 3)), date: addDays(today, 3) },
    { label: "Ce week-end", date: addDays(today, daysToSaturday), hint: "samedi" },
    { label: "Lundi prochain", date: addDays(today, daysToNextMonday) },
    { label: "Dans 1 semaine", date: addDays(today, 7) },
    { label: "Dans 2 semaines", date: addDays(today, 14) },
    { label: "Dans 1 mois", date: addDays(today, 30) },
  ];
  return (
    <Sheet title="Date d'échéance" onClose={onClose}>
      <div className="p-2">
        {options.map((o, i) => {
          const active = value === o.date && (o.time ? time === o.time : true);
          return (
            <button
              key={`${o.date}-${i}`}
              onClick={() => onChange(o.date, o.time ?? time)}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-[14px] transition active:scale-[0.98] ${
                active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="capitalize">{o.label}</span>
                {o.hint && <span className="text-[11px] text-[var(--text-subtle)]">{o.hint}</span>}
              </span>
              <span className="text-[12px] text-[var(--text-subtle)]">{formatShort(o.date)}</span>
            </button>
          );
        })}
        <div className="mt-2 flex gap-2 px-2 pb-2">
          <input
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || undefined, time)}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[14px] outline-none"
          />
          <input
            type="time"
            value={time ?? ""}
            onChange={(e) => onChange(value, e.target.value || undefined)}
            className="w-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[14px] outline-none"
          />
        </div>
        {value && (
          <button
            onClick={() => onChange(undefined, undefined)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] text-rose-600"
          >
            <Icon name="x" size={13} />
            Retirer la date
          </button>
        )}
      </div>
    </Sheet>
  );
}

function ProjectSheet({
  projects,
  selected,
  onSelect,
  onCreate,
  onClose,
}: {
  projects: Array<{ id: string; name: string; color: string }>;
  selected?: string;
  onSelect: (id?: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = projects.filter((p) => p.id !== "inbox" && p.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q.trim() && !projects.some((p) => p.name.toLowerCase() === q.trim().toLowerCase());
  return (
    <Sheet title="Projet" onClose={onClose}>
      <div className="p-2">
        <div className="px-2 pb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher ou créer…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[14px] outline-none"
          />
        </div>
        <button
          onClick={() => onSelect(undefined)}
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] ${!selected ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text)]"}`}
        >
          <Icon name="inbox" size={14} />
          Aucun projet
        </button>
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] ${selected === p.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text)]"}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        {canCreate && (
          <button
            onClick={() => onCreate(q.trim())}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] text-[var(--accent)]"
          >
            <Icon name="plus" size={14} />
            Créer « {q.trim()} »
          </button>
        )}
      </div>
    </Sheet>
  );
}

function PrioritySheet({
  value,
  onChange,
  onClose,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  onClose: () => void;
}) {
  const options: Array<{ p: Priority; label: string; desc: string }> = [
    { p: "urgent", label: "Urgente", desc: "À faire tout de suite" },
    { p: "high", label: "Haute", desc: "Important, bientôt" },
    { p: "medium", label: "Moyenne", desc: "À planifier" },
    { p: "low", label: "Basse", desc: "Si le temps" },
    { p: "none", label: "Aucune", desc: "Pas de priorité" },
  ];
  return (
    <Sheet title="Priorité" onClose={onClose}>
      <div className="p-2">
        {options.map((o) => (
          <button
            key={o.p}
            onClick={() => onChange(o.p)}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 ${value === o.p ? "bg-[var(--accent-soft)]" : ""}`}
          >
            <span className={`h-3 w-3 rounded-full ${PRIORITY_DOT[o.p]}`} />
            <span className="flex flex-col text-left">
              <span className="text-[14px] font-medium">{o.label}</span>
              <span className="text-[11.5px] text-[var(--text-muted)]">{o.desc}</span>
            </span>
            {value === o.p && <Icon name="check" size={14} className="ml-auto text-[var(--accent)]" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function TagsSheet({
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
    const t = tag.trim().replace(/^[@#]/, "");
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setInput("");
  }
  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }
  const filtered = suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase()));
  return (
    <Sheet title="Tags" onClose={onClose}>
      <div className="p-2">
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {value.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-[var(--bg-hover)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-muted)]">
                #{t}
                <button onClick={() => remove(t)} className="rounded-full p-0.5 text-[var(--text-subtle)] active:bg-[var(--border)]"><Icon name="x" size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="px-2 pb-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); add(input); }
            }}
            placeholder="Chercher ou créer un tag"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[14px] outline-none"
          />
        </div>
        {filtered.map((s) => (
          <button key={s} onClick={() => add(s)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px]">
            <span className="text-[var(--text-subtle)]">#</span>
            {s}
          </button>
        ))}
        {input.trim() && !suggestions.includes(input.trim()) && !value.includes(input.trim()) && (
          <button onClick={() => add(input)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] text-[var(--accent)]">
            <Icon name="plus" size={14} />
            Créer #{input.trim()}
          </button>
        )}
        <div className="p-2 pt-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-[13.5px] font-medium text-[var(--bg)] active:scale-95"
          >
            Valider
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function EstimateSheet({
  value,
  onChange,
  onClose,
}: {
  value?: number;
  onChange: (n?: number) => void;
  onClose: () => void;
}) {
  const quick = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240];
  return (
    <Sheet title="Durée estimée" onClose={onClose}>
      <div className="p-4">
        <div className="grid grid-cols-5 gap-2">
          {quick.map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`rounded-xl border px-2 py-3 text-[12px] transition active:scale-95 ${
                value === n
                  ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                  : "border-[var(--border)] bg-[var(--bg)]"
              }`}
            >
              {formatMin(n)}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <input
            type="number"
            min={0}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="Minutes personnalisées"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[14px] outline-none"
          />
        </div>
        {value && (
          <button onClick={() => onChange(undefined)} className="mt-3 w-full rounded-xl px-4 py-3 text-[13px] text-rose-600">
            <Icon name="x" size={13} className="inline mr-1" />
            Retirer
          </button>
        )}
      </div>
    </Sheet>
  );
}

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
  if (n < 60) return `${n}min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

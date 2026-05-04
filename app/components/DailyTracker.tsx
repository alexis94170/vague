"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { addDays, todayISO } from "../lib/dates";
import { haptic } from "../lib/haptics";
import Icon from "./Icon";

const THEME_KEY = "vague:daily-theme:v1";
const MOOD_KEY = "vague:daily-mood:v1";

type ThemeData = { date: string; theme: string };
type MoodData = { date: string; mood: string };

const MOODS: Array<{ emoji: string; label: string }> = [
  { emoji: "🔥", label: "À fond" },
  { emoji: "💪", label: "Motivé" },
  { emoji: "🙂", label: "Tranquille" },
  { emoji: "😐", label: "Mou" },
  { emoji: "😴", label: "Crevé" },
  { emoji: "🎯", label: "Focus" },
];

const THEME_SUGGESTIONS = [
  "Admin du jour",
  "Mise en place",
  "Développement",
  "Réparations",
  "Personnel",
  "Récupération",
];

export default function DailyTracker() {
  const { tasks } = useStore();
  const today = todayISO();
  const yesterday = addDays(today, -1);

  // Theme du jour (persisted)
  const [theme, setTheme] = useState("");
  const [mood, setMood] = useState("");
  const [editingTheme, setEditingTheme] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const t = JSON.parse(localStorage.getItem(THEME_KEY) || "null") as ThemeData | null;
      if (t && t.date === today) setTheme(t.theme);
    } catch {}
    try {
      const m = JSON.parse(localStorage.getItem(MOOD_KEY) || "null") as MoodData | null;
      if (m && m.date === today) setMood(m.mood);
    } catch {}
  }, [today]);

  function saveTheme(v: string) {
    setTheme(v);
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_KEY, JSON.stringify({ date: today, theme: v }));
    }
  }
  function saveMood(v: string) {
    setMood(v);
    haptic("light");
    if (typeof window !== "undefined") {
      localStorage.setItem(MOOD_KEY, JSON.stringify({ date: today, mood: v }));
    }
  }

  const stats = useMemo(() => {
    let doneToday = 0;
    let doneYesterday = 0;
    let plannedToday = 0;
    let urgent = 0;
    let overdue = 0;
    let waiting = 0;
    for (const t of tasks) {
      if (t.deletedAt) continue;
      if (t.done) {
        const d = (t.doneAt ?? "").slice(0, 10);
        if (d === today) doneToday++;
        else if (d === yesterday) doneYesterday++;
        continue;
      }
      if (t.waiting) { waiting++; continue; }
      // active
      if (t.dueDate === today) plannedToday++;
      if (t.dueDate && t.dueDate < today) overdue++;
      if (t.priority === "urgent" && (!t.dueDate || t.dueDate <= today)) urgent++;
    }
    const total = doneToday + plannedToday + overdue;
    const pct = total > 0 ? Math.round((doneToday / total) * 100) : 0;
    const trend = doneToday - doneYesterday;
    return { doneToday, doneYesterday, plannedToday, urgent, overdue, waiting, total, pct, trend };
  }, [tasks, today, yesterday]);

  const todayLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const todayLabelCap = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);

  const moodObj = MOODS.find((m) => m.emoji === mood);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-soft)] to-transparent px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Icon name="sun" size={14} className="text-[var(--accent)]" />
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Suivi du jour
          </h3>
        </div>
        <span className="text-[11.5px] text-[var(--text-muted)]">{todayLabelCap}</span>
      </header>

      {/* Theme & Mood */}
      <div className="grid grid-cols-1 gap-px bg-[var(--border)] sm:grid-cols-2">
        {/* Theme */}
        <div className="bg-[var(--bg-elev)] p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Thème de la journée
          </div>
          {editingTheme || !theme ? (
            <div className="mt-1.5 space-y-1.5">
              <input
                autoFocus
                value={theme}
                onChange={(e) => saveTheme(e.target.value)}
                onBlur={() => setEditingTheme(false)}
                onKeyDown={(e) => { if (e.key === "Enter") { setEditingTheme(false); (e.target as HTMLInputElement).blur(); } }}
                placeholder="Ex: Admin, Mise en place, Récup…"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[14px] outline-none focus:border-[var(--accent)]/40"
              />
              <div className="flex flex-wrap gap-1">
                {THEME_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { saveTheme(s); setEditingTheme(false); }}
                    className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingTheme(true)}
              className="mt-1.5 flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-[16px] font-semibold text-[var(--text)] hover:text-[var(--accent)]"
            >
              <span>{theme}</span>
              <span className="text-[10px] text-[var(--text-subtle)]">éditer</span>
            </button>
          )}
        </div>

        {/* Mood */}
        <div className="bg-[var(--bg-elev)] p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Humeur du jour
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MOODS.map((m) => {
              const active = mood === m.emoji;
              return (
                <button
                  key={m.emoji}
                  onClick={() => saveMood(active ? "" : m.emoji)}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition active:scale-95 ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
                  }`}
                  title={m.label}
                >
                  <span className="text-[14px]">{m.emoji}</span>
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
          {moodObj && (
            <div className="mt-2 text-[11px] text-[var(--text-muted)]">
              Tu te sens <strong>{moodObj.label.toLowerCase()}</strong> aujourd&apos;hui {moodObj.emoji}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="border-t border-[var(--border)] p-5">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          <Stat label="Faites" value={stats.doneToday} tone="emerald" />
          <Stat label="À faire" value={stats.plannedToday + stats.overdue} tone="indigo" />
          <Stat label="Urgentes" value={stats.urgent} tone="rose" />
          <Stat label="En attente" value={stats.waiting} tone="amber" />
        </div>

        {stats.total > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11.5px]">
              <span className="font-medium text-[var(--text-muted)]">Progression</span>
              <span className="tabular-nums font-semibold text-[var(--text)]">{stats.pct}%</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-[var(--bg-hover)]">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                  stats.pct === 100 ? "bg-emerald-500" : "bg-gradient-to-r from-[var(--accent)] to-violet-500"
                }`}
                style={{ width: `${stats.pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Trend */}
        <div className="mt-3 flex items-center justify-between text-[11.5px]">
          <span className="text-[var(--text-muted)]">Hier</span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums text-[var(--text)]">{stats.doneYesterday} faites</span>
            {stats.doneYesterday > 0 && (
              stats.trend > 0 ? (
                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  ↑ +{stats.trend} vs hier
                </span>
              ) : stats.trend < 0 ? (
                <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                  ↓ {stats.trend} vs hier
                </span>
              ) : (
                <span className="rounded-full bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                  = vs hier
                </span>
              )
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "indigo" | "rose" | "amber" }) {
  const colors: Record<typeof tone, { bg: string; text: string }> = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400" },
    indigo: { bg: "bg-[var(--accent-soft)]", text: "text-[var(--accent)]" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400" },
  };
  const c = colors[tone];
  return (
    <div className={`rounded-xl ${c.bg} p-3`}>
      <div className={`text-[22px] font-bold leading-tight tabular-nums ${c.text}`}>{value}</div>
      <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

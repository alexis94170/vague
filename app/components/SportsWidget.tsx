"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, todayISO, parseISODate } from "../lib/dates";
import { haptic } from "../lib/haptics";
import Icon from "./Icon";

const STORAGE_KEY = "vague:sport:v1";

type Workout = {
  id: string;
  date: string;
  type: string;
  emoji: string;
  duration: number;
  notes?: string;
};

const TYPES: Array<{ key: string; label: string; emoji: string }> = [
  { key: "course", label: "Course", emoji: "🏃" },
  { key: "muscu", label: "Muscu", emoji: "💪" },
  { key: "velo", label: "Vélo", emoji: "🚴" },
  { key: "natation", label: "Natation", emoji: "🏊" },
  { key: "yoga", label: "Yoga", emoji: "🧘" },
  { key: "marche", label: "Marche", emoji: "🚶" },
  { key: "foot", label: "Foot", emoji: "⚽" },
  { key: "autre", label: "Autre", emoji: "🎯" },
];

const DURATIONS = [15, 30, 45, 60, 90];

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadWorkouts(): Workout[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Workout[]) : [];
  } catch {
    return [];
  }
}

function saveWorkouts(arr: Workout[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

export default function SportsWidget() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [selType, setSelType] = useState<string>("course");
  const [selDuration, setSelDuration] = useState<number>(30);

  useEffect(() => {
    setWorkouts(loadWorkouts());
  }, []);

  function update(next: Workout[]) {
    setWorkouts(next);
    saveWorkouts(next);
  }
  function addWorkout() {
    const t = TYPES.find((x) => x.key === selType) ?? TYPES[0];
    const w: Workout = {
      id: uid(),
      date: todayISO(),
      type: t.label,
      emoji: t.emoji,
      duration: selDuration,
    };
    update([w, ...workouts]);
    setLogging(false);
    haptic("success");
  }
  function remove(id: string) {
    update(workouts.filter((w) => w.id !== id));
  }

  const today = todayISO();
  const todayWorkouts = workouts.filter((w) => w.date === today);
  const last7Days = useMemo(() => {
    const days: Array<{ date: string; label: string; minutes: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      const ws = workouts.filter((w) => w.date === d);
      const totalMin = ws.reduce((sum, w) => sum + w.duration, 0);
      const dn = parseISODate(d).toLocaleDateString("fr-FR", { weekday: "narrow" });
      days.push({ date: d, label: dn.toUpperCase(), minutes: totalMin });
    }
    return days;
  }, [workouts, today]);

  const weekTotal = last7Days.reduce((sum, d) => sum + d.minutes, 0);
  const weekDays = last7Days.filter((d) => d.minutes > 0).length;

  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i);
    const ws = workouts.filter((w) => w.date === d);
    if (ws.length > 0) streak++;
    else if (i === 0 && todayWorkouts.length === 0) continue;
    else break;
  }

  const maxMin = Math.max(60, ...last7Days.map((d) => d.minutes));

  // Subtitle
  let subtitle = "Aucune session";
  if (todayWorkouts.length > 0) {
    const todayMin = todayWorkouts.reduce((sum, w) => sum + w.duration, 0);
    subtitle = `${todayMin} min aujourd'hui · ${weekDays}/7 j cette sem.`;
  } else if (weekTotal > 0) {
    subtitle = `${weekTotal} min cette semaine`;
    if (streak >= 2) subtitle += ` · 🔥 ${streak} j`;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-[18px]">
          💪
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-[var(--text)]">Sport</div>
          <div className="truncate text-[11.5px] text-[var(--text-muted)]">{subtitle}</div>
        </div>
        <Icon name="chevron-right" size={14} className={`shrink-0 text-[var(--text-subtle)] transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-5 py-4">
          {/* Today */}
          {todayWorkouts.length > 0 && (
            <div className="mb-3 space-y-1">
              <div className="px-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Aujourd&apos;hui
              </div>
              {todayWorkouts.map((w) => (
                <div key={w.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-[var(--bg-hover)]">
                  <span className="text-[16px]">{w.emoji}</span>
                  <span className="flex-1 text-[13.5px] font-medium text-[var(--text)]">{w.type}</span>
                  <span className="text-[11.5px] tabular-nums text-[var(--text-muted)]">{w.duration} min</span>
                  <button
                    onClick={() => remove(w.id)}
                    className="invisible text-[var(--text-subtle)] hover:text-rose-600 group-hover:visible"
                    aria-label="Supprimer"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Logging */}
          {logging ? (
            <div className="mb-3 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSelType(t.key)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition active:scale-95 ${
                      selType === t.key
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)] bg-[var(--bg-elev)] text-[var(--text-muted)]"
                    }`}
                  >
                    <span>{t.emoji}</span>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelDuration(d)}
                    className={`rounded-full border px-3 py-1 text-[12px] font-medium transition active:scale-95 ${
                      selDuration === d
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)] bg-[var(--bg-elev)] text-[var(--text-muted)]"
                    }`}
                  >
                    {d} min
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setLogging(false)}
                  className="rounded-full px-3 py-1.5 text-[12px] text-[var(--text-muted)]"
                >
                  Annuler
                </button>
                <button
                  onClick={addWorkout}
                  className="ml-auto rounded-full bg-[var(--accent)] px-4 py-1.5 text-[12px] font-semibold text-white active:scale-95"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLogging(true)}
              className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] py-2.5 text-[13px] font-medium text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
            >
              <Icon name="plus" size={13} />
              Logger une session
            </button>
          )}

          {/* 7-day chart */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                7 derniers jours
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">{weekDays}/7 j</span>
            </div>
            <div className="flex items-end gap-1.5 h-12">
              {last7Days.map((d, i) => {
                const isToday = d.date === today;
                const h = d.minutes > 0 ? Math.max(8, (d.minutes / maxMin) * 100) : 4;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t-sm transition-all ${
                          d.minutes === 0 ? "bg-[var(--bg-hover)]" : isToday ? "bg-[var(--accent)]" : "bg-[var(--accent)]/40"
                        }`}
                        style={{ height: `${h}%` }}
                        title={d.minutes ? `${d.minutes} min` : "Repos"}
                      />
                    </div>
                    <span className={`text-[9px] tabular-nums ${isToday ? "font-bold text-[var(--accent)]" : "text-[var(--text-subtle)]"}`}>
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

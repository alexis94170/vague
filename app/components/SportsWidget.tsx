"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, todayISO, parseISODate } from "../lib/dates";
import { haptic } from "../lib/haptics";
import Icon from "./Icon";

const STORAGE_KEY = "vague:sport:v1";

type Workout = {
  id: string;
  date: string; // YYYY-MM-DD
  type: string; // "course", "muscu", "velo", etc
  emoji: string;
  duration: number; // minutes
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

  // Stats
  const today = todayISO();
  const todayWorkouts = workouts.filter((w) => w.date === today);
  const last7Days = useMemo(() => {
    const days: Array<{ date: string; label: string; minutes: number; emoji?: string }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      const ws = workouts.filter((w) => w.date === d);
      const totalMin = ws.reduce((sum, w) => sum + w.duration, 0);
      const dn = parseISODate(d).toLocaleDateString("fr-FR", { weekday: "narrow" });
      days.push({ date: d, label: dn.toUpperCase(), minutes: totalMin, emoji: ws[0]?.emoji });
    }
    return days;
  }, [workouts, today]);

  const weekTotal = last7Days.reduce((sum, d) => sum + d.minutes, 0);
  const weekDays = last7Days.filter((d) => d.minutes > 0).length;

  // Streak (from today backwards)
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i);
    const ws = workouts.filter((w) => w.date === d);
    if (ws.length > 0) streak++;
    else if (i === 0 && todayWorkouts.length === 0) continue; // grace today
    else break;
  }

  const maxMin = Math.max(60, ...last7Days.map((d) => d.minutes));

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-emerald-50 to-teal-50 p-5 dark:from-emerald-950/30 dark:to-teal-950/30">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-[18px] shadow-sm">
            💪
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text)]">Sport</h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              {weekTotal} min cette semaine{streak >= 2 ? ` · 🔥 ${streak} j` : ""}
            </p>
          </div>
        </div>
        {!logging && (
          <button
            onClick={() => setLogging(true)}
            className="rounded-full bg-emerald-500 px-3 py-1 text-[12px] font-semibold text-white shadow-sm active:scale-95"
          >
            + Logger
          </button>
        )}
      </header>

      {/* Today's workouts */}
      {todayWorkouts.length > 0 && (
        <div className="mb-3 rounded-xl bg-white/70 p-3 backdrop-blur dark:bg-black/30">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Aujourd&apos;hui
          </div>
          {todayWorkouts.map((w) => (
            <div key={w.id} className="group mt-1 flex items-center gap-2">
              <span className="text-[18px]">{w.emoji}</span>
              <span className="flex-1 text-[14px] font-medium text-[var(--text)]">{w.type}</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                {w.duration} min
              </span>
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

      {/* Logging form */}
      {logging && (
        <div className="mb-3 rounded-xl bg-white/80 p-3 backdrop-blur dark:bg-black/30">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Type
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelType(t.key)}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition active:scale-95 ${
                  selType === t.key
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-[var(--border)] bg-white text-[var(--text-muted)] dark:bg-black/30"
                }`}
              >
                <span>{t.emoji}</span>
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-3 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Durée (min)
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setSelDuration(d)}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition active:scale-95 ${
                  selDuration === d
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-[var(--border)] bg-white text-[var(--text-muted)] dark:bg-black/30"
                }`}
              >
                {d}
              </button>
            ))}
            <input
              type="number"
              value={selDuration}
              onChange={(e) => setSelDuration(parseInt(e.target.value) || 0)}
              className="w-16 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[12px] outline-none dark:bg-black/30"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setLogging(false)}
              className="rounded-full px-3 py-1.5 text-[12px] text-[var(--text-muted)]"
            >
              Annuler
            </button>
            <button
              onClick={addWorkout}
              disabled={selDuration <= 0}
              className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500 px-4 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              <Icon name="check" size={12} />
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* 7-day chart */}
      <div className="rounded-xl bg-white/70 p-3 backdrop-blur dark:bg-black/30">
        <div className="mb-2 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          <span>7 derniers jours</span>
          <span className="font-bold text-emerald-700 dark:text-emerald-400">{weekDays}/7 j</span>
        </div>
        <div className="flex items-end gap-1.5 h-16">
          {last7Days.map((d, i) => {
            const isToday = d.date === today;
            const h = d.minutes > 0 ? Math.max(8, (d.minutes / maxMin) * 100) : 4;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      d.minutes === 0
                        ? "bg-[var(--bg-hover)]"
                        : isToday
                          ? "bg-emerald-500"
                          : "bg-emerald-400/70"
                    }`}
                    style={{ height: `${h}%` }}
                    title={d.minutes ? `${d.minutes} min` : "Repos"}
                  />
                </div>
                <span className={`text-[9.5px] tabular-nums ${isToday ? "font-bold text-emerald-700 dark:text-emerald-400" : "text-[var(--text-subtle)]"}`}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {todayWorkouts.length === 0 && !logging && (
        <p className="mt-3 text-center text-[11.5px] text-[var(--text-muted)]">
          Pas encore d&apos;entraînement aujourd&apos;hui
        </p>
      )}
    </section>
  );
}

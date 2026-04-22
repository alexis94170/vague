"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { haptic } from "./lib/haptics";

type PomodoroState = {
  taskId: string | null;
  taskTitle: string | null;
  startedAt: number;
  duration: number; // seconds
  paused: boolean;
  pausedAt: number | null;
  elapsedWhilePaused: number;
};

type Ctx = {
  active: boolean;
  state: PomodoroState | null;
  remaining: number;
  progress: number;
  start: (opts: { taskId?: string; taskTitle?: string; minutes?: number }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

const PomodoroContext = createContext<Ctx | null>(null);

const KEY = "vague:pomodoro:v1";

function loadState(): PomodoroState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(s: PomodoroState | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

function playBeep() {
  try {
    const AudioCtx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.3 + 0.25);
      osc.start(ctx.currentTime + i * 0.3);
      osc.stop(ctx.currentTime + i * 0.3 + 0.25);
    }
  } catch {}
}

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PomodoroState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    setState(loadState());
  }, []);

  // Tick every second
  useEffect(() => {
    if (!state) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [state]);

  useEffect(() => {
    saveState(state);
    if (!state) completedRef.current = false;
  }, [state]);

  const remaining = state
    ? Math.max(0, state.duration * 1000 - ((state.paused ? (state.pausedAt ?? now) : now) - state.startedAt - state.elapsedWhilePaused)) / 1000
    : 0;

  // Completion detection
  useEffect(() => {
    if (!state) return;
    if (remaining === 0 && !completedRef.current) {
      completedRef.current = true;
      haptic("success");
      playBeep();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("Vague — Pomodoro terminé", {
            body: state.taskTitle ? `« ${state.taskTitle} » — session de ${Math.round(state.duration / 60)} min finie.` : `Session de ${Math.round(state.duration / 60)} min terminée.`,
            icon: "/icon.svg",
          });
        } catch {}
      }
    }
  }, [remaining, state]);

  const start = useCallback((opts: { taskId?: string; taskTitle?: string; minutes?: number }) => {
    const minutes = opts.minutes ?? 25;
    const next: PomodoroState = {
      taskId: opts.taskId ?? null,
      taskTitle: opts.taskTitle ?? null,
      startedAt: Date.now(),
      duration: minutes * 60,
      paused: false,
      pausedAt: null,
      elapsedWhilePaused: 0,
    };
    setState(next);
    completedRef.current = false;
    haptic("medium");
  }, []);

  const pause = useCallback(() => {
    setState((s) => (s && !s.paused ? { ...s, paused: true, pausedAt: Date.now() } : s));
  }, []);

  const resume = useCallback(() => {
    setState((s) => {
      if (!s || !s.paused || !s.pausedAt) return s;
      return { ...s, paused: false, elapsedWhilePaused: s.elapsedWhilePaused + (Date.now() - s.pausedAt), pausedAt: null };
    });
  }, []);

  const stop = useCallback(() => {
    setState(null);
  }, []);

  const progress = state ? 1 - remaining / state.duration : 0;

  return (
    <PomodoroContext.Provider value={{ active: !!state, state, remaining, progress, start, pause, resume, stop }}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro(): Ctx {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error("usePomodoro must be used in PomodoroProvider");
  return ctx;
}

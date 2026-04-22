"use client";

import { useState } from "react";
import { usePomodoro } from "../pomodoro";
import Icon from "./Icon";

export default function PomodoroWidget() {
  const { active, state, remaining, progress, pause, resume, stop } = usePomodoro();
  const [expanded, setExpanded] = useState(false);

  if (!active || !state) return null;

  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  const timeLabel = `${mins}:${String(secs).padStart(2, "0")}`;
  const finished = remaining === 0;
  const circumference = 2 * Math.PI * 22;
  const strokeOffset = circumference * (1 - progress);

  return (
    <div
      className="fixed z-40 anim-fade-up"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 88px)",
        left: "16px",
      }}
    >
      {expanded ? (
        <div className="flex w-64 flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${finished ? "text-emerald-500" : "text-[var(--accent)]"}`}>
                {finished ? "Terminé !" : state.paused ? "En pause" : "Pomodoro"}
              </span>
            </div>
            <button onClick={() => setExpanded(false)} className="rounded px-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
              <Icon name="x" size={12} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0">
              <svg viewBox="0 0 50 50" className="h-full w-full -rotate-90">
                <circle cx="25" cy="25" r="22" fill="none" stroke="var(--bg-hover)" strokeWidth="4" />
                <circle cx="25" cy="25" r="22" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={strokeOffset}
                  className={finished ? "text-emerald-500" : "text-[var(--accent)]"}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">
                {timeLabel}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium">
                {state.taskTitle ?? "Session de focus"}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {Math.round(state.duration / 60)} min au total
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {finished ? (
              <button onClick={stop} className="flex-1 rounded-md bg-emerald-500 px-2 py-1.5 text-[12px] font-medium text-white active:scale-95">
                OK
              </button>
            ) : (
              <>
                {state.paused ? (
                  <button onClick={resume} className="flex-1 rounded-md bg-[var(--accent)] px-2 py-1.5 text-[12px] font-medium text-white active:scale-95">
                    Reprendre
                  </button>
                ) : (
                  <button onClick={pause} className="flex-1 rounded-md bg-[var(--bg-hover)] px-2 py-1.5 text-[12px] font-medium text-[var(--text)] active:scale-95">
                    Pause
                  </button>
                )}
                <button onClick={stop} className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[12px] text-[var(--text-muted)] active:scale-95">
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className={`flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 shadow-md active:scale-95 ${finished ? "animate-pulse" : ""}`}
        >
          <div className="relative h-6 w-6">
            <svg viewBox="0 0 50 50" className="h-full w-full -rotate-90">
              <circle cx="25" cy="25" r="22" fill="none" stroke="var(--bg-hover)" strokeWidth="6" />
              <circle cx="25" cy="25" r="22" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={strokeOffset}
                className={finished ? "text-emerald-500" : "text-[var(--accent)]"}
              />
            </svg>
          </div>
          <span className="text-[12.5px] font-semibold tabular-nums">{timeLabel}</span>
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useGoogle } from "../google";
import { GoogleEvent, eventEnd, eventStart, isAllDay } from "../lib/google-client";
import { Task } from "../lib/types";
import { todayISO } from "../lib/dates";
import { findEventConflicts, formatHourMinute } from "../lib/calendar-utils";

type Props = {
  onOpenTask: (id: string) => void;
};

const HOUR_HEIGHT = 56; // pixels per hour
const START_HOUR = 6;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;

type TimelineItem =
  | { kind: "event"; event: GoogleEvent; start: Date; end: Date }
  | { kind: "task"; task: Task; start: Date; end: Date };

function timeToY(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  return Math.max(0, (h - START_HOUR) * HOUR_HEIGHT);
}

function blockHeight(start: Date, end: Date): number {
  return Math.max(20, ((end.getTime() - start.getTime()) / 3_600_000) * HOUR_HEIGHT);
}

/**
 * Lay out items into columns to handle overlap.
 * Returns each item with its column index and total columns count for its overlap group.
 */
function layoutColumns(items: TimelineItem[]): Array<TimelineItem & { col: number; totalCols: number }> {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
  const result: Array<TimelineItem & { col: number; totalCols: number }> = [];
  let cluster: typeof result = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (cluster.length === 0) return;
    const total = Math.max(...cluster.map((c) => c.col)) + 1;
    for (const it of cluster) it.totalCols = total;
    result.push(...cluster);
    cluster = [];
    clusterEnd = -Infinity;
  }

  for (const it of sorted) {
    if (it.start.getTime() >= clusterEnd) {
      flushCluster();
    }
    // Find a column that's free
    const cols: TimelineItem[] = [];
    for (const c of cluster) cols[c.col] = c;
    let chosenCol = 0;
    while (cols[chosenCol] && cols[chosenCol].end.getTime() > it.start.getTime()) chosenCol++;
    cluster.push({ ...it, col: chosenCol, totalCols: 1 });
    if (it.end.getTime() > clusterEnd) clusterEnd = it.end.getTime();
  }
  flushCluster();
  return result;
}

export default function TimelineView({ onOpenTask }: Props) {
  const { tasks } = useStore();
  const { eventsForDate } = useGoogle();
  const [date] = useState(todayISO());
  const todayEvents = eventsForDate(date);
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const isToday = date === todayISO();
  const nowY = isToday ? timeToY(now) : -1;

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (isToday && scrollRef.current) {
      const target = Math.max(0, nowY - 100);
      scrollRef.current.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
    }
  }, [isToday, nowY]);

  // Build items for the day
  const items: TimelineItem[] = [];
  const allDayEvents: GoogleEvent[] = [];

  for (const e of todayEvents) {
    if (isAllDay(e)) {
      allDayEvents.push(e);
    } else {
      items.push({ kind: "event", event: e, start: eventStart(e), end: eventEnd(e) });
    }
  }

  for (const t of tasks) {
    if (t.deletedAt || t.done || t.waiting) continue;
    if (t.dueDate !== date || !t.dueTime) continue;
    const [h, m] = t.dueTime.split(":").map(Number);
    const start = new Date(date + "T00:00:00");
    start.setHours(h, m || 0, 0, 0);
    const duration = t.estimateMinutes ?? 30;
    const end = new Date(start.getTime() + duration * 60_000);
    items.push({ kind: "task", task: t, start, end });
  }

  const positioned = layoutColumns(items);

  const hours: number[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
      {/* All-day events strip */}
      {allDayEvents.length > 0 && (
        <div className="border-b border-[var(--border)] px-4 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Toute la journée
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allDayEvents.map((e) => (
              <a
                key={e.id}
                href={e.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate rounded-md px-2 py-1 text-[11.5px] font-medium"
                style={{
                  background: `color-mix(in srgb, ${e.__calendarColor ?? "var(--accent)"} 18%, transparent)`,
                  borderLeft: `2px solid ${e.__calendarColor ?? "var(--accent)"}`,
                  color: e.__calendarColor ?? "var(--accent)",
                  maxWidth: 220,
                }}
              >
                {e.summary || "(Sans titre)"}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="relative max-h-[70vh] overflow-y-auto">
        <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {/* Hour gridlines + labels */}
          {hours.map((h) => {
            const y = (h - START_HOUR) * HOUR_HEIGHT;
            return (
              <div key={h} className="absolute inset-x-0 flex items-start" style={{ top: y }}>
                <span className="w-12 shrink-0 -translate-y-2 px-2 text-right text-[10px] font-medium tabular-nums text-[var(--text-subtle)]">
                  {h.toString().padStart(2, "0")}h
                </span>
                <span className="block flex-1 border-t border-[var(--border)]/50" />
              </div>
            );
          })}

          {/* Half-hour gridlines (subtle) */}
          {hours.slice(0, -1).map((h) => {
            const y = (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2;
            return (
              <div key={`half-${h}`} className="absolute left-12 right-0 border-t border-dashed border-[var(--border)]/30" style={{ top: y }} />
            );
          })}

          {/* Now indicator */}
          {isToday && nowY >= 0 && nowY <= TOTAL_HOURS * HOUR_HEIGHT && (
            <div className="absolute left-12 right-2 z-10 flex items-center" style={{ top: nowY }}>
              <span className="-ml-1 h-2 w-2 rounded-full bg-rose-500 anim-pulse-soft" />
              <span className="block h-[1.5px] flex-1 bg-rose-500" />
            </div>
          )}

          {/* Items */}
          <div className="absolute left-12 right-2 top-0 bottom-0">
            {positioned.map((it, i) => {
              const top = timeToY(it.start);
              const height = blockHeight(it.start, it.end);
              const widthPct = 100 / it.totalCols;
              const leftPct = it.col * widthPct;

              if (it.kind === "event") {
                const e = it.event;
                const color = e.__calendarColor ?? "var(--accent)";
                return (
                  <a
                    key={`e-${i}-${e.id}`}
                    href={e.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute overflow-hidden rounded-md px-2 py-1 text-[11.5px] leading-tight transition-transform active:scale-[0.98]"
                    style={{
                      top,
                      height,
                      left: `${leftPct}%`,
                      width: `calc(${widthPct}% - 4px)`,
                      background: `color-mix(in srgb, ${color} 22%, transparent)`,
                      borderLeft: `3px solid ${color}`,
                      color,
                    }}
                    title={`${e.summary ?? ""} · ${formatHourMinute(it.start)}–${formatHourMinute(it.end)}`}
                  >
                    <div className="truncate font-medium">{e.summary || "(Sans titre)"}</div>
                    {height > 36 && (
                      <div className="mt-0.5 truncate text-[10px] opacity-80">
                        {formatHourMinute(it.start)} – {formatHourMinute(it.end)}
                      </div>
                    )}
                  </a>
                );
              }

              const t = it.task;
              const conflicts = findEventConflicts(t, todayEvents);
              const hasConflict = conflicts.length > 0;
              return (
                <button
                  key={`t-${i}-${t.id}`}
                  onClick={() => onOpenTask(t.id)}
                  className={`absolute overflow-hidden rounded-md border-2 border-dashed px-2 py-1 text-left text-[11.5px] leading-tight transition-transform active:scale-[0.98] ${
                    hasConflict ? "border-rose-400 bg-rose-500/10" : "border-[var(--accent)]/60 bg-[var(--accent-soft)]"
                  }`}
                  style={{
                    top,
                    height,
                    left: `${leftPct}%`,
                    width: `calc(${widthPct}% - 4px)`,
                  }}
                  title={`${t.title} · ${formatHourMinute(it.start)}–${formatHourMinute(it.end)}${hasConflict ? ` ⚠ Conflit avec ${conflicts.length} event(s)` : ""}`}
                >
                  <div className={`flex items-center gap-1 truncate font-medium ${hasConflict ? "text-rose-700 dark:text-rose-400" : "text-[var(--accent)]"}`}>
                    {hasConflict && <span>⚠</span>}
                    {t.title}
                  </div>
                  {height > 36 && (
                    <div className="mt-0.5 truncate text-[10px] opacity-80">
                      {formatHourMinute(it.start)} – {formatHourMinute(it.end)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

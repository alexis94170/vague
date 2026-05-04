"use client";

import { GoogleEvent, eventEnd, eventStart, isAllDay } from "./google-client";
import { Task } from "./types";

// === Time helpers ===

export function parseDateTime(dateISO: string, timeHHMM: string): Date {
  return new Date(`${dateISO}T${timeHHMM}:00`);
}

export function taskTimeRange(task: Task): { start: Date; end: Date } | null {
  if (!task.dueDate || !task.dueTime) return null;
  const start = parseDateTime(task.dueDate, task.dueTime);
  const minutes = task.estimateMinutes ?? 30;
  const end = new Date(start.getTime() + minutes * 60_000);
  return { start, end };
}

export type TimeBlock = { start: Date; end: Date };

export function blocksOverlap(a: TimeBlock, b: TimeBlock): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

// === Conflict detection ===

/**
 * Returns events that conflict with the given task's time range.
 * All-day events are ignored.
 */
export function findEventConflicts(task: Task, events: GoogleEvent[]): GoogleEvent[] {
  const range = taskTimeRange(task);
  if (!range) return [];
  return events.filter((e) => {
    if (isAllDay(e)) return false;
    const eRange = { start: eventStart(e), end: eventEnd(e) };
    return blocksOverlap(range, eRange);
  });
}

// === Free slot finding ===

export type FreeSlot = {
  start: Date;
  end: Date;
  minutes: number;
};

/**
 * Compute free time slots within [dayStart, dayEnd], avoiding the given events.
 * All-day events are ignored. Slots shorter than `minMinutes` are filtered out.
 */
export function findFreeSlots(
  events: GoogleEvent[],
  dayStart: Date,
  dayEnd: Date,
  minMinutes = 15
): FreeSlot[] {
  // Filter to events within the day, drop all-day
  const dayEvents = events
    .filter((e) => !isAllDay(e))
    .map((e) => ({ start: eventStart(e), end: eventEnd(e) }))
    .filter((b) => b.end.getTime() > dayStart.getTime() && b.start.getTime() < dayEnd.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Clamp + merge overlapping
  const merged: TimeBlock[] = [];
  for (const e of dayEvents) {
    const start = new Date(Math.max(e.start.getTime(), dayStart.getTime()));
    const end = new Date(Math.min(e.end.getTime(), dayEnd.getTime()));
    if (start.getTime() >= end.getTime()) continue;
    const last = merged[merged.length - 1];
    if (last && start.getTime() <= last.end.getTime()) {
      if (end.getTime() > last.end.getTime()) last.end = end;
    } else {
      merged.push({ start, end });
    }
  }

  // Compute gaps
  const slots: FreeSlot[] = [];
  let cursor = dayStart;
  for (const block of merged) {
    if (block.start.getTime() > cursor.getTime()) {
      const minutes = Math.round((block.start.getTime() - cursor.getTime()) / 60_000);
      if (minutes >= minMinutes) {
        slots.push({ start: cursor, end: block.start, minutes });
      }
    }
    if (block.end.getTime() > cursor.getTime()) cursor = block.end;
  }
  if (cursor.getTime() < dayEnd.getTime()) {
    const minutes = Math.round((dayEnd.getTime() - cursor.getTime()) / 60_000);
    if (minutes >= minMinutes) {
      slots.push({ start: cursor, end: dayEnd, minutes });
    }
  }

  return slots;
}

/**
 * Take a list of tasks (each with estimateMinutes) and a list of free slots.
 * Greedy-fits tasks into slots (first-fit by priority).
 * Returns a plan: which task goes into which slot at what time.
 */
export type ScheduledTask = {
  taskId: string;
  taskTitle: string;
  start: Date;
  end: Date;
  estimateMinutes: number;
  slotIndex: number;
};

export function autoSchedule(
  tasks: Array<Pick<Task, "id" | "title" | "estimateMinutes" | "priority">>,
  slots: FreeSlot[],
  bufferMin = 5
): { scheduled: ScheduledTask[]; unscheduled: typeof tasks } {
  // Sort tasks: urgent first, then by estimate (longer first to fit large tasks first)
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
  const sortedTasks = [...tasks].sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 4;
    const pb = priorityOrder[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;
    return (b.estimateMinutes ?? 30) - (a.estimateMinutes ?? 30);
  });

  // Track remaining time in each slot
  const slotCursors = slots.map((s) => ({ ...s, cursor: new Date(s.start) }));

  const scheduled: ScheduledTask[] = [];
  const unscheduled: typeof tasks = [];

  for (const task of sortedTasks) {
    const duration = task.estimateMinutes ?? 30;
    let placed = false;
    for (let i = 0; i < slotCursors.length; i++) {
      const slot = slotCursors[i];
      const remaining = (slot.end.getTime() - slot.cursor.getTime()) / 60_000;
      if (remaining >= duration) {
        const start = new Date(slot.cursor);
        const end = new Date(start.getTime() + duration * 60_000);
        scheduled.push({
          taskId: task.id,
          taskTitle: task.title,
          start,
          end,
          estimateMinutes: duration,
          slotIndex: i,
        });
        slot.cursor = new Date(end.getTime() + bufferMin * 60_000);
        placed = true;
        break;
      }
    }
    if (!placed) unscheduled.push(task);
  }

  return { scheduled, unscheduled };
}

// === Day window helpers ===

/**
 * Returns a sensible work-day window for the given date.
 * Default: 8:00 to 19:00 (configurable by caller).
 */
export function workDayWindow(dateISO: string, opts?: { startHour?: number; endHour?: number }): { start: Date; end: Date } {
  const startHour = opts?.startHour ?? 8;
  const endHour = opts?.endHour ?? 19;
  const start = new Date(`${dateISO}T${String(startHour).padStart(2, "0")}:00:00`);
  const end = new Date(`${dateISO}T${String(endHour).padStart(2, "0")}:00:00`);
  return { start, end };
}

/**
 * If `dateISO` is today and current time is past the start, advance start to now (rounded up to next 5min).
 */
export function clampToNow(window: { start: Date; end: Date }, dateISO: string): { start: Date; end: Date } {
  const now = new Date();
  const todayISO = new Date().toISOString().slice(0, 10);
  if (dateISO !== todayISO) return window;
  if (now.getTime() <= window.start.getTime()) return window;
  // Round up to next 5 min
  const rounded = new Date(Math.ceil(now.getTime() / (5 * 60_000)) * (5 * 60_000));
  return { start: rounded, end: window.end };
}

// === Time formatting ===

export function formatHourMinute(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, "0")}`;
}

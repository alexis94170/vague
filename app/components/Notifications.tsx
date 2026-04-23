"use client";

import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { todayISO, addDays } from "../lib/dates";
import { Task } from "../lib/types";

const SHOWN_KEY = "vague:notifs-shown:v1";

function loadShown(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveShown(set: Set<string>) {
  if (typeof window === "undefined") return;
  // Keep only last 200 to avoid bloat
  const arr = Array.from(set);
  const trimmed = arr.length > 200 ? arr.slice(-200) : arr;
  localStorage.setItem(SHOWN_KEY, JSON.stringify(trimmed));
}

function buildKey(t: Task, d: string): string {
  return `${t.id}|${d}|${t.dueTime ?? ""}`;
}

async function showReminder(task: Task, label: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  // Prefer service worker showNotification (supports actions, persists)
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const opts: NotificationOptions & { actions?: Array<{ action: string; title: string }> } = {
        body: label,
        icon: "/icon-192.png",
        badge: "/favicon-32.png",
        tag: `vague-reminder-${task.id}`,
        requireInteraction: false,
        data: { taskId: task.id, url: "/?task=" + task.id, kind: "reminder" },
        actions: [
          { action: "done", title: "✓ Fait" },
          { action: "snooze1h", title: "+1 h" },
          { action: "snooze-tomorrow", title: "Demain" },
        ],
      };
      await reg.showNotification(`Vague — ${task.title}`, opts);
      return;
    } catch (e) {
      console.warn("SW notification failed, fallback:", e);
    }
  }
  // Fallback direct
  try {
    new Notification(`Vague — ${task.title}`, { body: label, icon: "/icon-192.png" });
  } catch (e) {
    console.warn("Notification failed", e);
  }
}

export default function Notifications() {
  const { tasks, toggleDone, patchTask } = useStore();
  const timeoutsRef = useRef<Map<string, number>>(new Map());
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    shownRef.current = loadShown();
  }, []);

  // Listen for SW messages (action clicks on notifications)
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    function handler(e: MessageEvent) {
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.kind === "notif-action" && msg.taskId && msg.action) {
        const task = tasks.find((t) => t.id === msg.taskId);
        if (!task) return;
        if (msg.action === "done" && !task.done) {
          toggleDone(task.id);
        } else if (msg.action === "snooze1h") {
          // push dueTime by 1h
          if (task.dueTime) {
            const [h, m] = task.dueTime.split(":").map(Number);
            const d = new Date();
            d.setHours(h + 1, m, 0, 0);
            patchTask(task.id, {
              dueTime: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
            });
          }
        } else if (msg.action === "snooze-tomorrow") {
          patchTask(task.id, { dueDate: addDays(todayISO(), 1) });
        }
      }
    }
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [tasks, toggleDone, patchTask]);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    // Clear old scheduled
    for (const [, id] of timeoutsRef.current) window.clearTimeout(id);
    timeoutsRef.current.clear();

    const today = todayISO();
    const now = Date.now();

    tasks.forEach((t) => {
      if (t.done || t.waiting || t.deletedAt) return;
      if (!t.dueDate || t.dueDate !== today) return;
      if (!t.dueTime) return;

      const [hh, mm] = t.dueTime.split(":").map((n) => parseInt(n, 10));
      if (isNaN(hh) || isNaN(mm)) return;
      const target = new Date();
      target.setHours(hh, mm, 0, 0);
      const ms = target.getTime() - now;
      if (ms <= 0) return;
      if (ms > 24 * 60 * 60 * 1000) return; // safety: plus de 24h

      const key = buildKey(t, today);
      if (shownRef.current.has(key)) return;

      const id = window.setTimeout(() => {
        showReminder(t, `Prévu à ${t.dueTime}`);
        shownRef.current.add(key);
        saveShown(shownRef.current);
      }, ms);

      timeoutsRef.current.set(t.id, id);
    });

    return () => {
      for (const [, id] of timeoutsRef.current) window.clearTimeout(id);
      timeoutsRef.current.clear();
    };
  }, [tasks]);

  return null;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

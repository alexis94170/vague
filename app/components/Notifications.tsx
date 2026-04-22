"use client";

import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { todayISO } from "../lib/dates";
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
  localStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(set)));
}

function buildKey(t: Task, d: string): string {
  return `${t.id}|${d}|${t.dueTime ?? ""}`;
}

export default function Notifications() {
  const { tasks } = useStore();
  const timeoutsRef = useRef<Map<string, number>>(new Map());
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    shownRef.current = loadShown();
  }, []);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    // Clear old scheduled
    for (const [, id] of timeoutsRef.current) window.clearTimeout(id);
    timeoutsRef.current.clear();

    const today = todayISO();
    const now = Date.now();

    tasks.forEach((t) => {
      if (t.done || t.waiting) return;
      if (!t.dueDate) return;
      if (t.dueDate !== today) return;
      if (!t.dueTime) return;

      const [hh, mm] = t.dueTime.split(":").map((n) => parseInt(n, 10));
      const target = new Date();
      target.setHours(hh, mm, 0, 0);
      const ms = target.getTime() - now;
      if (ms <= 0) return;

      const key = buildKey(t, today);
      if (shownRef.current.has(key)) return;
      if (ms > 24 * 60 * 60 * 1000) return; // safety

      const id = window.setTimeout(() => {
        try {
          new Notification(`Vague — ${t.title}`, {
            body: t.dueTime ? `Prévu à ${t.dueTime}` : "C'est l'heure !",
            icon: "/icon.svg",
            tag: `vague-${t.id}`,
          });
          shownRef.current.add(key);
          saveShown(shownRef.current);
        } catch (e) {
          console.warn("Notification failed", e);
        }
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

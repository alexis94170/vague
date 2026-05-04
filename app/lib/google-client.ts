"use client";

import { supabase } from "./supabase";

export type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  htmlLink?: string;
  status?: string;
};

export type GoogleStatus = {
  connected: boolean;
  email: string | null;
};

const CACHE_KEY = "vague:google:events:v1";
const STATUS_KEY = "vague:google:status:v1";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getStatus(): Promise<GoogleStatus> {
  try {
    const res = await fetch("/api/google/status", {
      credentials: "include",
      headers: await authHeaders(),
    });
    if (!res.ok) return { connected: false, email: null };
    const data = await res.json() as GoogleStatus;
    try { localStorage.setItem(STATUS_KEY, JSON.stringify(data)); } catch {}
    return data;
  } catch {
    return { connected: false, email: null };
  }
}

export function getCachedStatus(): GoogleStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    return raw ? (JSON.parse(raw) as GoogleStatus) : null;
  } catch {
    return null;
  }
}

export async function fetchEvents(fromISO: string, toISO: string): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({ from: fromISO, to: toISO });
  const res = await fetch(`/api/google/events?${params}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) return [];
    throw new Error(`Fetch events: ${res.status}`);
  }
  const data = await res.json() as { events?: GoogleEvent[]; error?: string };
  return data.events ?? [];
}

export type CachedEvents = {
  fromISO: string;
  toISO: string;
  fetchedAt: number;
  events: GoogleEvent[];
};

export function getCachedEvents(): CachedEvents | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedEvents) : null;
  } catch {
    return null;
  }
}

export function setCachedEvents(c: CachedEvents) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}

export function clearCachedEvents() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(STATUS_KEY);
  } catch {}
}

export async function createCalendarEvent(opts: {
  summary: string;
  description?: string;
  start: string; // ISO
  end: string; // ISO
}): Promise<GoogleEvent> {
  const res = await fetch("/api/google/create-event", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json() as { event: GoogleEvent };
  return data.event;
}

export async function disconnect(): Promise<void> {
  await fetch("/api/google/disconnect", {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  clearCachedEvents();
}

// === Helpers ===

export function isAllDay(e: GoogleEvent): boolean {
  return !!e.start.date && !e.start.dateTime;
}

export function eventStart(e: GoogleEvent): Date {
  return new Date(e.start.dateTime ?? e.start.date ?? 0);
}

export function eventEnd(e: GoogleEvent): Date {
  return new Date(e.end.dateTime ?? e.end.date ?? 0);
}

export function eventDateISO(e: GoogleEvent): string {
  // Returns YYYY-MM-DD for the event's start day in local time
  const d = eventStart(e);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatEventTime(e: GoogleEvent): string {
  if (isAllDay(e)) return "Toute la journée";
  const start = eventStart(e);
  const end = eventEnd(e);
  const fmt = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function eventDurationMinutes(e: GoogleEvent): number {
  const ms = eventEnd(e).getTime() - eventStart(e).getTime();
  return Math.round(ms / 60_000);
}

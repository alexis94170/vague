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
  // Server-enriched
  __accountEmail?: string;
  __accountId?: string;
  __calendarId?: string;
  __calendarName?: string;
  __calendarColor?: string;
};

export type GoogleAccount = {
  id: string;
  email: string;
};

export type GoogleCalendar = {
  id: string;
  account_id: string;
  calendar_id: string;
  name: string | null;
  color: string | null;
  enabled: boolean;
  is_primary: boolean;
};

const CACHE_KEY = "vague:google:cache:v2";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// === Accounts + calendars ===

export async function fetchAccounts(): Promise<{
  accounts: GoogleAccount[];
  calendars: GoogleCalendar[];
}> {
  const res = await fetch("/api/google/accounts", {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) return { accounts: [], calendars: [] };
    throw new Error(`Accounts: ${res.status}`);
  }
  const data = await res.json() as {
    accounts?: GoogleAccount[];
    calendars?: GoogleCalendar[];
  };
  return { accounts: data.accounts ?? [], calendars: data.calendars ?? [] };
}

export async function toggleCalendar(calendarRowId: string, enabled: boolean): Promise<void> {
  const res = await fetch("/api/google/calendars/toggle", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ calendarRowId, enabled }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

export async function disconnectAccount(accountId?: string): Promise<void> {
  const res = await fetch("/api/google/disconnect", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(accountId ? { accountId } : {}),
  });
  if (!res.ok) throw new Error(`Disconnect: ${res.status}`);
}

// === Events ===

export async function fetchEvents(fromISO: string, toISO: string): Promise<{
  events: GoogleEvent[];
  errors: string[];
}> {
  const params = new URLSearchParams({ from: fromISO, to: toISO });
  const res = await fetch(`/api/google/events?${params}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (res.status === 401) return { events: [], errors: [] };
    throw new Error((body as { error?: string }).error ?? `Erreur ${res.status}`);
  }
  const data = await res.json() as { events?: GoogleEvent[]; errors?: string[] };
  return { events: data.events ?? [], errors: data.errors ?? [] };
}

// === Create event ===

export async function createCalendarEvent(opts: {
  summary: string;
  description?: string;
  start: string;
  end: string;
  accountId?: string;
  calendarId?: string;
}): Promise<{ event: GoogleEvent; accountEmail: string }> {
  const res = await fetch("/api/google/create-event", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// === Local cache ===

export type Cache = {
  accounts: GoogleAccount[];
  calendars: GoogleCalendar[];
  events: GoogleEvent[];
  fetchedAt: number;
};

export function getCache(): Cache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cache) : null;
  } catch {
    return null;
  }
}

export function setCache(c: Cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}

export function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
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

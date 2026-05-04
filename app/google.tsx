"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth";
import {
  GoogleEvent,
  GoogleStatus,
  disconnect as apiDisconnect,
  fetchEvents,
  getCachedEvents,
  getCachedStatus,
  getStatus,
  setCachedEvents,
} from "./lib/google-client";
import { addDays, todayISO } from "./lib/dates";

type Ctx = {
  status: GoogleStatus | null;
  events: GoogleEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Returns events whose start day matches dateISO (YYYY-MM-DD). */
  eventsForDate: (dateISO: string) => GoogleEvent[];
};

const GoogleCtx = createContext<Ctx | null>(null);

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min

export function GoogleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<GoogleStatus | null>(() => getCachedStatus());
  const [events, setEvents] = useState<GoogleEvent[]>(() => getCachedEvents()?.events ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetch = useRef<number>(0);

  const fetchWindow = useCallback(() => {
    // Fetch from 7 days ago to 60 days ahead
    const today = todayISO();
    const from = new Date(`${addDays(today, -7)}T00:00:00`).toISOString();
    const to = new Date(`${addDays(today, 60)}T23:59:59`).toISOString();
    return { from, to };
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    if (!status?.connected) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = fetchWindow();
      const evs = await fetchEvents(from, to);
      setEvents(evs);
      setCachedEvents({ fromISO: from, toISO: to, fetchedAt: Date.now(), events: evs });
      lastFetch.current = Date.now();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, status?.connected, fetchWindow]);

  const refreshStatus = useCallback(async () => {
    if (!user) return;
    const s = await getStatus();
    setStatus(s);
  }, [user]);

  const disconnect = useCallback(async () => {
    await apiDisconnect();
    setStatus({ connected: false, email: null });
    setEvents([]);
  }, []);

  // Fetch status when user logs in
  useEffect(() => {
    if (user) refreshStatus();
    else {
      setStatus(null);
      setEvents([]);
    }
  }, [user, refreshStatus]);

  // Auto-refresh events when connected
  useEffect(() => {
    if (status?.connected) {
      refresh();
      const interval = setInterval(() => {
        if (Date.now() - lastFetch.current > REFRESH_INTERVAL_MS) {
          refresh();
        }
      }, REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }
  }, [status?.connected, refresh]);

  // Refresh when window regains focus (after OAuth flow)
  useEffect(() => {
    function onFocus() {
      refreshStatus();
      if (status?.connected) refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, refreshStatus, status?.connected]);

  // Group events by start date (YYYY-MM-DD local) for fast lookup
  const eventsByDate = useMemo(() => {
    const map = new Map<string, GoogleEvent[]>();
    for (const e of events) {
      const start = new Date(e.start.dateTime ?? e.start.date ?? 0);
      const y = start.getFullYear();
      const m = String(start.getMonth() + 1).padStart(2, "0");
      const d = String(start.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${d}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const eventsForDate = useCallback(
    (dateISO: string) => eventsByDate.get(dateISO) ?? [],
    [eventsByDate]
  );

  const value: Ctx = {
    status,
    events,
    loading,
    error,
    refresh,
    refreshStatus,
    disconnect,
    eventsForDate,
  };

  return <GoogleCtx.Provider value={value}>{children}</GoogleCtx.Provider>;
}

export function useGoogle(): Ctx {
  const ctx = useContext(GoogleCtx);
  if (!ctx) throw new Error("useGoogle must be inside <GoogleProvider>");
  return ctx;
}

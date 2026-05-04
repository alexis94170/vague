"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth";
import {
  GoogleAccount,
  GoogleCalendar,
  GoogleEvent,
  Cache,
  disconnectAccount as apiDisconnectAccount,
  fetchAccounts,
  fetchEvents,
  getCache,
  setCache as cacheSet,
  clearCache,
  toggleCalendar as apiToggleCalendar,
} from "./lib/google-client";
import { addDays, todayISO } from "./lib/dates";

type Ctx = {
  accounts: GoogleAccount[];
  calendars: GoogleCalendar[];
  events: GoogleEvent[];
  errors: string[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  refresh: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  disconnect: (accountId?: string) => Promise<void>;
  toggleCalendar: (calendarRowId: string, enabled: boolean) => Promise<void>;
  /** Returns events whose start day matches dateISO (YYYY-MM-DD). */
  eventsForDate: (dateISO: string) => GoogleEvent[];
  /** Helper: get a calendar row by id */
  calendarById: (calendarRowId: string) => GoogleCalendar | undefined;
};

const GoogleCtx = createContext<Ctx | null>(null);

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min

export function GoogleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const cached = typeof window !== "undefined" ? getCache() : null;
  const [accounts, setAccounts] = useState<GoogleAccount[]>(cached?.accounts ?? []);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>(cached?.calendars ?? []);
  const [events, setEvents] = useState<GoogleEvent[]>(cached?.events ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetch = useRef<number>(0);

  const isConnected = accounts.length > 0;

  const fetchWindow = useCallback(() => {
    const today = todayISO();
    const from = new Date(`${addDays(today, -7)}T00:00:00`).toISOString();
    const to = new Date(`${addDays(today, 60)}T23:59:59`).toISOString();
    return { from, to };
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    if (accounts.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = fetchWindow();
      const { events: evs, errors: errs } = await fetchEvents(from, to);
      setEvents(evs);
      setErrors(errs);
      cacheSet({
        accounts,
        calendars,
        events: evs,
        fetchedAt: Date.now(),
      } satisfies Cache);
      lastFetch.current = Date.now();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, accounts, calendars, fetchWindow]);

  const refreshAccounts = useCallback(async () => {
    if (!user) return;
    try {
      const { accounts: accs, calendars: cals } = await fetchAccounts();
      setAccounts(accs);
      setCalendars(cals);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);

  const disconnect = useCallback(async (accountId?: string) => {
    await apiDisconnectAccount(accountId);
    if (accountId) {
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      setCalendars((prev) => prev.filter((c) => c.account_id !== accountId));
      setEvents((prev) => prev.filter((e) => e.__accountId !== accountId));
    } else {
      setAccounts([]);
      setCalendars([]);
      setEvents([]);
      clearCache();
    }
  }, []);

  const toggleCalendar = useCallback(async (calendarRowId: string, enabled: boolean) => {
    // Optimistic
    setCalendars((prev) => prev.map((c) => c.id === calendarRowId ? { ...c, enabled } : c));
    try {
      await apiToggleCalendar(calendarRowId, enabled);
      // refetch events to apply the change
      await refresh();
    } catch (e) {
      // Rollback
      setCalendars((prev) => prev.map((c) => c.id === calendarRowId ? { ...c, enabled: !enabled } : c));
      setError((e as Error).message);
    }
  }, [refresh]);

  // Fetch accounts when user logs in
  useEffect(() => {
    if (user) refreshAccounts();
    else {
      setAccounts([]);
      setCalendars([]);
      setEvents([]);
      clearCache();
    }
  }, [user, refreshAccounts]);

  // Auto-refresh events when there's at least one account
  useEffect(() => {
    if (accounts.length > 0) {
      refresh();
      const interval = setInterval(() => {
        if (Date.now() - lastFetch.current > REFRESH_INTERVAL_MS) {
          refresh();
        }
      }, REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }
  }, [accounts.length, refresh]);

  // Refresh when window regains focus
  useEffect(() => {
    function onFocus() {
      refreshAccounts();
      if (accounts.length > 0) refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, refreshAccounts, accounts.length]);

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

  const calendarsById = useMemo(() => {
    const m = new Map<string, GoogleCalendar>();
    for (const c of calendars) m.set(c.id, c);
    return m;
  }, [calendars]);

  const calendarById = useCallback(
    (id: string) => calendarsById.get(id),
    [calendarsById]
  );

  const value: Ctx = {
    accounts,
    calendars,
    events,
    errors,
    loading,
    error,
    isConnected,
    refresh,
    refreshAccounts,
    disconnect,
    toggleCalendar,
    eventsForDate,
    calendarById,
  };

  return <GoogleCtx.Provider value={value}>{children}</GoogleCtx.Provider>;
}

export function useGoogle(): Ctx {
  const ctx = useContext(GoogleCtx);
  if (!ctx) throw new Error("useGoogle must be inside <GoogleProvider>");
  return ctx;
}

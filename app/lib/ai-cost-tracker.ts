"use client";

const KEY = "vague:ai-cost:v1";

type Entry = { ts: number; endpoint: string; cost: number };
type Store = { entries: Entry[] };

function load(): Store {
  if (typeof window === "undefined") return { entries: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { entries: [] };
    return JSON.parse(raw);
  } catch {
    return { entries: [] };
  }
}

function save(s: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function recordAiCost(endpoint: string, cost: number) {
  if (!cost || cost <= 0) return;
  const s = load();
  s.entries.push({ ts: Date.now(), endpoint, cost });
  // Cap at 500 entries to keep localStorage small
  if (s.entries.length > 500) s.entries = s.entries.slice(-500);
  save(s);
}

export function getAiCostSummary(): {
  today: number;
  last7d: number;
  last30d: number;
  total: number;
  count: number;
  byEndpoint: Record<string, { count: number; cost: number }>;
} {
  const s = load();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = startOfDay.getTime();

  let t = 0, w = 0, m = 0, total = 0;
  const by: Record<string, { count: number; cost: number }> = {};
  for (const e of s.entries) {
    total += e.cost;
    if (e.ts >= today) t += e.cost;
    if (e.ts >= now - 7 * day) w += e.cost;
    if (e.ts >= now - 30 * day) m += e.cost;
    by[e.endpoint] ??= { count: 0, cost: 0 };
    by[e.endpoint].count += 1;
    by[e.endpoint].cost += e.cost;
  }
  return { today: t, last7d: w, last30d: m, total, count: s.entries.length, byEndpoint: by };
}

export function clearAiCost() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

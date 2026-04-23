// In-memory rate limiter for AI endpoints.
// Per-IP (client-side fallback) and per-endpoint.
// Not persistent across deploys — good enough for protecting burst spend.

type Bucket = { tokens: number; resetAt: number };

const buckets = new Map<string, Bucket>();

type Limit = {
  max: number;
  windowMs: number;
};

const LIMITS: Record<string, Limit> = {
  classify: { max: 50, windowMs: 60 * 60 * 1000 },      // 50/hour
  suggest:  { max: 20, windowMs: 60 * 60 * 1000 },      // 20/hour
  plan:     { max: 10, windowMs: 60 * 60 * 1000 },      // 10/hour
  chat:     { max: 40, windowMs: 60 * 60 * 1000 },      // 40/hour
};

const DAILY_BUDGET_USD = 1.0; // hard ceiling per day per user-ip
const dailySpend = new Map<string, { usd: number; dayKey: string }>();

function ipFromHeaders(headers: Headers): string {
  // Netlify / Vercel
  const cfIp = headers.get("cf-connecting-ip");
  const forwarded = headers.get("x-forwarded-for");
  const nfIp = headers.get("x-nf-client-connection-ip");
  if (cfIp) return cfIp;
  if (nfIp) return nfIp;
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkRateLimit(endpoint: keyof typeof LIMITS, headers: Headers): { ok: true } | { ok: false; retryAfter: number } {
  const lim = LIMITS[endpoint];
  if (!lim) return { ok: true };
  const ip = ipFromHeaders(headers);
  const key = `${endpoint}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { tokens: lim.max - 1, resetAt: now + lim.windowMs });
    return { ok: true };
  }
  if (b.tokens <= 0) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.tokens -= 1;
  return { ok: true };
}

export function checkDailyBudget(headers: Headers): { ok: true } | { ok: false; current: number } {
  const ip = ipFromHeaders(headers);
  const day = todayKey();
  const cur = dailySpend.get(ip);
  if (!cur || cur.dayKey !== day) {
    dailySpend.set(ip, { usd: 0, dayKey: day });
    return { ok: true };
  }
  if (cur.usd >= DAILY_BUDGET_USD) {
    return { ok: false, current: cur.usd };
  }
  return { ok: true };
}

export function recordSpend(headers: Headers, usd: number) {
  const ip = ipFromHeaders(headers);
  const day = todayKey();
  const cur = dailySpend.get(ip);
  if (!cur || cur.dayKey !== day) {
    dailySpend.set(ip, { usd, dayKey: day });
  } else {
    cur.usd += usd;
  }
}

// Rough cost calculation based on model.
// Prices per 1M tokens (in USD), as of 2026-04.
const MODEL_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-4-5":   { input: 1,   output: 5,  cacheRead: 0.10, cacheWrite: 1.25 },
  "claude-sonnet-4-6":  { input: 3,   output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-opus-4-7":    { input: 5,   output: 25, cacheRead: 0.50, cacheWrite: 6.25 },
};

export function estimateCost(model: string, tokens: {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}): number {
  const p = MODEL_PRICES[model] ?? MODEL_PRICES["claude-sonnet-4-6"];
  const million = 1_000_000;
  return (
    (tokens.input * p.input) / million +
    (tokens.output * p.output) / million +
    ((tokens.cacheRead ?? 0) * p.cacheRead) / million +
    ((tokens.cacheWrite ?? 0) * p.cacheWrite) / million
  );
}

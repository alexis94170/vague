import type { SupabaseClient } from "@supabase/supabase-js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export type GoogleAccount = {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  email: string;
};

export type GoogleCalendarRow = {
  id: string;
  account_id: string;
  calendar_id: string;
  name: string | null;
  color: string | null;
  enabled: boolean;
  is_primary: boolean;
};

export type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  htmlLink?: string;
  status?: string;
  // Custom: enrichments we add server-side for UI
  __accountEmail?: string;
  __accountId?: string;
  __calendarId?: string;
  __calendarName?: string;
  __calendarColor?: string;
};

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID manquant");
  return v;
}

function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET manquant");
  return v;
}

function redirectUri(reqUrl: string): string {
  const u = new URL(reqUrl);
  return `${u.origin}/api/google/callback`;
}

// === OAuth helpers ===

export function buildAuthUrl(state: string, reqUrl: string, forceAccountPicker = true): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(reqUrl),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    // Force select_account so the user can pick a different Google account each time
    prompt: forceAccountPicker ? "select_account consent" : "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string, reqUrl: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(reqUrl),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

// === Account storage ===

export async function saveAccount(
  sb: SupabaseClient,
  userId: string,
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    email: string;
  }
): Promise<GoogleAccount> {
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  // Upsert by (user_id, email)
  const { data, error } = await sb
    .from("google_tokens")
    .upsert(
      {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope,
        email: tokens.email,
      },
      { onConflict: "user_id,email" }
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(`Save account failed: ${error?.message ?? "unknown"}`);
  return data as GoogleAccount;
}

export async function loadAccounts(sb: SupabaseClient, userId: string): Promise<GoogleAccount[]> {
  const { data, error } = await sb
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as GoogleAccount[];
}

export async function loadAccountById(sb: SupabaseClient, userId: string, accountId: string): Promise<GoogleAccount | null> {
  const { data } = await sb
    .from("google_tokens")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as GoogleAccount | null) ?? null;
}

export async function deleteAccount(sb: SupabaseClient, userId: string, accountId: string): Promise<GoogleAccount | null> {
  const acc = await loadAccountById(sb, userId, accountId);
  if (!acc) return null;
  // Best-effort revoke
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acc.access_token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {}
  await sb.from("google_tokens").delete().eq("id", accountId).eq("user_id", userId);
  return acc;
}

/**
 * Returns a valid access token for the given account, refreshing if needed.
 */
export async function getValidAccessToken(sb: SupabaseClient, account: GoogleAccount): Promise<string | null> {
  const expiresAt = new Date(account.expires_at).getTime();
  const now = Date.now();
  if (expiresAt > now + 30_000) {
    return account.access_token;
  }
  try {
    const refreshed = await refreshAccessToken(account.refresh_token);
    const newExpiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
    await sb
      .from("google_tokens")
      .update({
        access_token: refreshed.access_token,
        expires_at: newExpiresAt,
        scope: refreshed.scope,
      })
      .eq("id", account.id);
    return refreshed.access_token;
  } catch (e) {
    console.error("Refresh token failed:", e);
    return null;
  }
}

// === Calendar list management ===

type GoogleCalendarListItem = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  selected?: boolean;
  accessRole?: string;
};

export async function fetchGoogleCalendarList(accessToken: string): Promise<GoogleCalendarListItem[]> {
  const res = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList?minAccessRole=reader`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List calendars failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { items?: GoogleCalendarListItem[] };
  return data.items ?? [];
}

/**
 * Fetch the user's calendars from Google and upsert into google_calendars.
 * Preserves the `enabled` flag for already-known calendars.
 */
export async function syncCalendars(sb: SupabaseClient, accountId: string, accessToken: string): Promise<GoogleCalendarRow[]> {
  const items = await fetchGoogleCalendarList(accessToken);

  // Load existing rows to preserve `enabled` toggle
  const { data: existing } = await sb
    .from("google_calendars")
    .select("calendar_id,enabled")
    .eq("account_id", accountId);
  const existingMap = new Map<string, boolean>(
    ((existing as Array<{ calendar_id: string; enabled: boolean }> | null) ?? []).map((r) => [r.calendar_id, r.enabled])
  );

  const rows = items.map((c) => ({
    account_id: accountId,
    calendar_id: c.id,
    name: c.summaryOverride ?? c.summary ?? null,
    color: c.backgroundColor ?? null,
    is_primary: !!c.primary,
    // Keep enabled if already known, else default true for primary, false for others
    enabled: existingMap.has(c.id) ? existingMap.get(c.id)! : (c.primary ? true : c.selected !== false),
  }));

  if (rows.length === 0) return [];

  const { data, error } = await sb
    .from("google_calendars")
    .upsert(rows, { onConflict: "account_id,calendar_id" })
    .select("*");
  if (error) throw new Error(`Save calendars failed: ${error.message}`);
  return (data ?? []) as GoogleCalendarRow[];
}

export async function loadCalendars(sb: SupabaseClient, accountIds: string[]): Promise<GoogleCalendarRow[]> {
  if (accountIds.length === 0) return [];
  const { data, error } = await sb
    .from("google_calendars")
    .select("*")
    .in("account_id", accountIds);
  if (error) return [];
  return (data ?? []) as GoogleCalendarRow[];
}

export async function setCalendarEnabled(
  sb: SupabaseClient,
  userId: string,
  calendarRowId: string,
  enabled: boolean
): Promise<void> {
  // RLS will block updates if the calendar doesn't belong to user, no extra check needed
  await sb.from("google_calendars").update({ enabled }).eq("id", calendarRowId);
}

// === Events ===

export async function listEvents(
  accessToken: string,
  opts: { timeMin: string; timeMax: string; calendarId: string }
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin: opts.timeMin,
    timeMax: opts.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(opts.calendarId)}/events?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List events for ${opts.calendarId}: ${res.status} ${text}`);
  }
  const data = await res.json() as { items?: GoogleEvent[] };
  return data.items ?? [];
}

/**
 * Fetch events from ALL enabled calendars across ALL accounts of the user.
 * Returns events enriched with __account/__calendar metadata.
 */
export async function listAllUserEvents(
  sb: SupabaseClient,
  userId: string,
  timeMin: string,
  timeMax: string
): Promise<{ events: GoogleEvent[]; errors: string[] }> {
  const accounts = await loadAccounts(sb, userId);
  if (accounts.length === 0) return { events: [], errors: [] };

  const calendars = await loadCalendars(sb, accounts.map((a) => a.id));
  const enabled = calendars.filter((c) => c.enabled);

  const events: GoogleEvent[] = [];
  const errors: string[] = [];

  // Group enabled calendars by account
  const byAccount = new Map<string, GoogleCalendarRow[]>();
  for (const c of enabled) {
    const list = byAccount.get(c.account_id) ?? [];
    list.push(c);
    byAccount.set(c.account_id, list);
  }

  // For each account, get a valid access token, then fetch each calendar in parallel
  const accountTasks = accounts.map(async (account) => {
    const cals = byAccount.get(account.id);
    if (!cals || cals.length === 0) return;
    const token = await getValidAccessToken(sb, account);
    if (!token) {
      errors.push(`Auth expirée pour ${account.email}`);
      return;
    }
    const calTasks = cals.map(async (cal) => {
      try {
        const items = await listEvents(token, {
          timeMin,
          timeMax,
          calendarId: cal.calendar_id,
        });
        for (const e of items) {
          e.__accountEmail = account.email;
          e.__accountId = account.id;
          e.__calendarId = cal.calendar_id;
          e.__calendarName = cal.name ?? undefined;
          e.__calendarColor = cal.color ?? undefined;
          events.push(e);
        }
      } catch (err) {
        const msg = (err as Error).message;
        // 404 on a deleted calendar should be silent; others surface
        if (!msg.includes("404")) {
          errors.push(`${account.email} / ${cal.name ?? cal.calendar_id}: ${msg.slice(0, 100)}`);
        }
      }
    });
    await Promise.all(calTasks);
  });

  await Promise.all(accountTasks);

  // Sort by start time
  events.sort((a, b) => {
    const ta = new Date(a.start.dateTime ?? a.start.date ?? 0).getTime();
    const tb = new Date(b.start.dateTime ?? b.start.date ?? 0).getTime();
    return ta - tb;
  });

  return { events, errors };
}

export async function createEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
  },
  calendarId = "primary"
): Promise<GoogleEvent> {
  const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create event failed: ${res.status} ${text}`);
  }
  return res.json();
}

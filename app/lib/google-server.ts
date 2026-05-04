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

export type GoogleTokens = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  email: string | null;
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
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  organizer?: { email: string; displayName?: string };
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

export function buildAuthUrl(state: string, reqUrl: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(reqUrl),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // force refresh_token
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

// === Token storage in Supabase ===

export async function saveTokens(
  sb: SupabaseClient,
  userId: string,
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    email: string | null;
  }
): Promise<void> {
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  const { error } = await sb.from("google_tokens").upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope,
    email: tokens.email,
  });
  if (error) throw new Error(`Save tokens failed: ${error.message}`);
}

export async function loadTokens(sb: SupabaseClient, userId: string): Promise<GoogleTokens | null> {
  const { data, error } = await sb
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data as GoogleTokens | null;
}

export async function deleteTokens(sb: SupabaseClient, userId: string): Promise<void> {
  await sb.from("google_tokens").delete().eq("user_id", userId);
}

/**
 * Returns a valid access token, refreshing if needed.
 */
export async function getValidAccessToken(sb: SupabaseClient, userId: string): Promise<string | null> {
  const tokens = await loadTokens(sb, userId);
  if (!tokens) return null;

  const expiresAt = new Date(tokens.expires_at).getTime();
  const now = Date.now();
  if (expiresAt > now + 30_000) {
    return tokens.access_token; // still valid
  }

  // Refresh
  try {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    const newExpiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
    await sb
      .from("google_tokens")
      .update({
        access_token: refreshed.access_token,
        expires_at: newExpiresAt,
        scope: refreshed.scope,
      })
      .eq("user_id", userId);
    return refreshed.access_token;
  } catch (e) {
    console.error("Refresh token failed:", e);
    return null;
  }
}

// === Calendar API ===

export async function listEvents(
  accessToken: string,
  opts: { timeMin: string; timeMax: string; calendarId?: string }
): Promise<GoogleEvent[]> {
  const calendarId = opts.calendarId ?? "primary";
  const params = new URLSearchParams({
    timeMin: opts.timeMin,
    timeMax: opts.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List events failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { items?: GoogleEvent[] };
  return data.items ?? [];
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

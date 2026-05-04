import { NextRequest } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";
import { exchangeCode, fetchUserEmail, saveAccount, syncCalendars } from "../../../lib/google-server";

export const runtime = "nodejs";

/**
 * GET /api/google/callback?code=...&state=...
 * Google redirects here after the user grants access.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return Response.redirect(`${url.origin}/?google=denied`, 302);
  }

  if (!code || !state) {
    return Response.redirect(`${url.origin}/?google=error&reason=missing-params`, 302);
  }

  // Verify CSRF cookie
  const cookieHeader = req.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("vague_oauth_state="))
    ?.split("=")[1];

  const [, stateRandom] = state.split(".");
  if (!stateCookie || !stateRandom || stateCookie !== stateRandom) {
    return Response.redirect(`${url.origin}/?google=error&reason=csrf`, 302);
  }

  const sb = await supabaseServer();
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return Response.redirect(`${url.origin}/?google=error&reason=auth`, 302);
  }
  const user = userData.user;

  const [stateUserId] = state.split(".");
  if (stateUserId !== user.id) {
    return Response.redirect(`${url.origin}/?google=error&reason=user-mismatch`, 302);
  }

  try {
    const tokens = await exchangeCode(code, req.url);
    const email = await fetchUserEmail(tokens.access_token);
    if (!email) {
      return Response.redirect(`${url.origin}/?google=error&reason=no-email`, 302);
    }
    const account = await saveAccount(sb, user.id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      scope: tokens.scope,
      email,
    });
    // Sync the user's calendars right away
    try {
      await syncCalendars(sb, account.id, tokens.access_token);
    } catch (e) {
      console.error("syncCalendars failed (non-fatal):", e);
    }
  } catch (e) {
    console.error("OAuth callback failed:", e);
    return Response.redirect(`${url.origin}/?google=error&reason=exchange-failed`, 302);
  }

  const res = new Response(null, { status: 302 });
  res.headers.set("Location", `${url.origin}/?google=connected`);
  res.headers.set(
    "Set-Cookie",
    `vague_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
  return res;
}

import { NextRequest } from "next/server";
import { requireUser } from "../../../lib/supabase-server";
import { deleteTokens, loadTokens } from "../../../lib/google-server";

export const runtime = "nodejs";

/**
 * POST /api/google/disconnect
 * Revokes the Google OAuth tokens server-side and removes from DB.
 */
export async function POST(_req: NextRequest) {
  try {
    const { user, sb } = await requireUser();
    const tokens = await loadTokens(sb, user.id);
    if (tokens?.access_token) {
      // Best-effort revoke
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.access_token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch {}
    }
    await deleteTokens(sb, user.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

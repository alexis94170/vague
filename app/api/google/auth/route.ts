import { NextRequest } from "next/server";
import { requireUser } from "../../../lib/supabase-server";
import { buildAuthUrl } from "../../../lib/google-server";

export const runtime = "nodejs";

/**
 * GET /api/google/auth
 * Redirects the (authenticated) user to Google's OAuth consent screen.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser();

    // CSRF state — random + tied to userId
    const random = crypto.randomUUID().replace(/-/g, "");
    const state = `${user.id}.${random}`;

    const url = buildAuthUrl(state, req.url);

    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        "Set-Cookie": `vague_oauth_state=${random}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("auth route error:", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

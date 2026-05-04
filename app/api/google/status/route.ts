import { NextRequest } from "next/server";
import { requireUser } from "../../../lib/supabase-server";
import { loadTokens } from "../../../lib/google-server";

export const runtime = "nodejs";

/**
 * GET /api/google/status
 * Returns whether the user is connected to Google Calendar + which email.
 */
export async function GET(_req: NextRequest) {
  try {
    const { user, sb } = await requireUser();
    const tokens = await loadTokens(sb, user.id);
    return Response.json({
      connected: !!tokens,
      email: tokens?.email ?? null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

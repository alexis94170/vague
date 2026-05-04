import { NextRequest } from "next/server";
import { requireUser } from "../../../lib/supabase-server";
import { listAllUserEvents } from "../../../lib/google-server";

export const runtime = "nodejs";

/**
 * GET /api/google/events?from=ISO&to=ISO
 * Returns events from ALL the user's connected accounts and ENABLED calendars.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, sb } = await requireUser();

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to) {
      return Response.json({ error: "from + to requis (ISO 8601)" }, { status: 400 });
    }

    const { events, errors } = await listAllUserEvents(sb, user.id, from, to);
    return Response.json({ events, errors });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("events route error:", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

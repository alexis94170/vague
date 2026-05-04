import { NextRequest } from "next/server";
import { requireUser } from "../../../../lib/supabase-server";
import { setCalendarEnabled } from "../../../../lib/google-server";

export const runtime = "nodejs";

/**
 * POST /api/google/calendars/toggle
 * Body: { calendarRowId: string, enabled: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const { user, sb } = await requireUser();
    const body = (await req.json()) as { calendarRowId?: string; enabled?: boolean };
    if (!body.calendarRowId || typeof body.enabled !== "boolean") {
      return Response.json({ error: "calendarRowId + enabled requis" }, { status: 400 });
    }
    await setCalendarEnabled(sb, user.id, body.calendarRowId, body.enabled);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

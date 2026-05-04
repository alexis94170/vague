import { NextRequest } from "next/server";
import { requireUser } from "../../../lib/supabase-server";
import { createEvent, getValidAccessToken } from "../../../lib/google-server";

export const runtime = "nodejs";

type Body = {
  summary: string;
  description?: string;
  start: string; // ISO
  end: string; // ISO
  timeZone?: string;
};

/**
 * POST /api/google/create-event
 * Create an event on the user's primary calendar.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, sb } = await requireUser();
    const body = (await req.json()) as Body;

    if (!body.summary || !body.start || !body.end) {
      return Response.json({ error: "summary + start + end requis" }, { status: 400 });
    }

    const accessToken = await getValidAccessToken(sb, user.id);
    if (!accessToken) {
      return Response.json({ error: "not-connected" }, { status: 400 });
    }

    const tz = body.timeZone ?? "Europe/Paris";
    const event = await createEvent(accessToken, {
      summary: body.summary,
      description: body.description,
      start: { dateTime: body.start, timeZone: tz },
      end: { dateTime: body.end, timeZone: tz },
    });

    return Response.json({ event });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("create-event route error:", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

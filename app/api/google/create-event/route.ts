import { NextRequest } from "next/server";
import { requireUser } from "../../../lib/supabase-server";
import { createEvent, getValidAccessToken, loadAccountById, loadAccounts } from "../../../lib/google-server";

export const runtime = "nodejs";

type Body = {
  summary: string;
  description?: string;
  start: string; // ISO
  end: string; // ISO
  timeZone?: string;
  accountId?: string; // optional: target a specific account
  calendarId?: string; // optional: target a specific calendar (default "primary")
};

/**
 * POST /api/google/create-event
 * Create an event on the user's primary calendar (or a specific one).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, sb } = await requireUser();
    const body = (await req.json()) as Body;

    if (!body.summary || !body.start || !body.end) {
      return Response.json({ error: "summary + start + end requis" }, { status: 400 });
    }

    // Resolve account: by ID if given, else first connected account
    let account = null;
    if (body.accountId) {
      account = await loadAccountById(sb, user.id, body.accountId);
    } else {
      const accounts = await loadAccounts(sb, user.id);
      account = accounts[0] ?? null;
    }
    if (!account) {
      return Response.json({ error: "not-connected" }, { status: 400 });
    }

    const accessToken = await getValidAccessToken(sb, account);
    if (!accessToken) {
      return Response.json({ error: "Impossible de rafraîchir le token" }, { status: 400 });
    }

    const tz = body.timeZone ?? "Europe/Paris";
    const event = await createEvent(
      accessToken,
      {
        summary: body.summary,
        description: body.description,
        start: { dateTime: body.start, timeZone: tz },
        end: { dateTime: body.end, timeZone: tz },
      },
      body.calendarId ?? "primary"
    );

    return Response.json({ event, accountEmail: account.email });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("create-event route error:", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { requireUser } from "../../../lib/supabase-server";
import { getValidAccessToken, loadAccounts, loadCalendars, syncCalendars } from "../../../lib/google-server";

export const runtime = "nodejs";

/**
 * GET /api/google/accounts
 * Returns the list of connected Google accounts and their calendars.
 * Also opportunistically re-syncs the calendar list for each account.
 */
export async function GET(_req: NextRequest) {
  try {
    const { user, sb } = await requireUser();
    const accounts = await loadAccounts(sb, user.id);

    if (accounts.length === 0) {
      return Response.json({ accounts: [], calendars: [] });
    }

    // Re-sync calendars in parallel (non-blocking errors)
    await Promise.all(
      accounts.map(async (a) => {
        try {
          const token = await getValidAccessToken(sb, a);
          if (token) await syncCalendars(sb, a.id, token);
        } catch (e) {
          console.error(`syncCalendars for ${a.email} failed:`, e);
        }
      })
    );

    const calendars = await loadCalendars(sb, accounts.map((a) => a.id));

    // Strip secrets from accounts before returning
    const safeAccounts = accounts.map((a) => ({
      id: a.id,
      email: a.email,
    }));

    const safeCalendars = calendars.map((c) => ({
      id: c.id,
      account_id: c.account_id,
      calendar_id: c.calendar_id,
      name: c.name,
      color: c.color,
      enabled: c.enabled,
      is_primary: c.is_primary,
    }));

    return Response.json({ accounts: safeAccounts, calendars: safeCalendars });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

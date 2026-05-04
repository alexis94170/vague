import { NextRequest } from "next/server";
import { requireUser } from "../../../lib/supabase-server";
import { deleteAccount } from "../../../lib/google-server";

export const runtime = "nodejs";

/**
 * POST /api/google/disconnect
 * Body: { accountId?: string } — if omitted, disconnects ALL accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, sb } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { accountId?: string };

    if (body.accountId) {
      await deleteAccount(sb, user.id, body.accountId);
    } else {
      // Disconnect all
      const { data } = await sb.from("google_tokens").select("id").eq("user_id", user.id);
      const ids = ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
      for (const id of ids) {
        await deleteAccount(sb, user.id, id);
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type SubscribeBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  accessToken: string;
};

export async function POST(req: Request) {
  let body: SubscribeBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalide" }, { status: 400 });
  }
  const { endpoint, keys, userAgent, accessToken } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth || !accessToken) {
    return Response.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr || !userData.user) {
    return Response.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { error } = await client
    .from("push_subscriptions")
    .upsert({
      user_id: userData.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: userAgent,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });

  if (error) {
    console.error("push subscribe failed:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  let body: { endpoint: string; accessToken: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalide" }, { status: 400 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${body.accessToken}` } },
    auth: { persistSession: false },
  });
  const { error } = await client.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";

type SendBody = {
  title: string;
  body?: string;
  url?: string;
  accessToken: string;
  tag?: string;
};

function configure() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@vague.app";
  if (!pub || !priv) throw new Error("VAPID keys missing");
  webpush.setVapidDetails(subject, pub, priv);
}

export async function POST(req: Request) {
  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalide" }, { status: 400 });
  }
  if (!body.title || !body.accessToken) {
    return Response.json({ error: "title et accessToken requis" }, { status: 400 });
  }

  try {
    configure();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 501 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${body.accessToken}` } },
    auth: { persistSession: false },
  });

  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { data: subs, error } = await client
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userData.user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) {
    return Response.json({ ok: true, sent: 0, message: "Aucun abonnement" });
  }

  const payload = JSON.stringify({
    title: body.title,
    body: body.body ?? "",
    url: body.url ?? "/",
    tag: body.tag ?? "vague-notification",
  });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  // Clean up dead subscriptions (410 Gone)
  const dead: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const err = r.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        dead.push(subs[i].endpoint);
      }
    }
  });
  if (dead.length > 0) {
    await client.from("push_subscriptions").delete().in("endpoint", dead);
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return Response.json({ ok: true, sent, failed: results.length - sent });
}

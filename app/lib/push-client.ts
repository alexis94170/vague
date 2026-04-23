"use client";

import { supabase } from "./supabase";

function urlB64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const str = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(str);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function pushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Non supporté sur ce navigateur" };
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, error: "VAPID key manquante" };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "Permission refusée" };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey),
    });
  }

  const token = await getAccessToken();
  if (!token) return { ok: false, error: "Non authentifié" };

  const endpoint = sub.endpoint;
  const keys = sub.toJSON().keys as { p256dh: string; auth: string };

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      keys,
      userAgent: navigator.userAgent,
      accessToken: token,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur" }));
    return { ok: false, error: err.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean }> {
  if (!isPushSupported()) return { ok: false };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };

  const token = await getAccessToken();
  if (token) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, accessToken: token }),
    }).catch(() => {});
  }
  await sub.unsubscribe();
  return { ok: true };
}

export async function sendTestPush(): Promise<{ ok: boolean; error?: string; sent?: number }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "Non authentifié" };
  const res = await fetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Vague — test",
      body: "Les notifications push fonctionnent 🌊",
      url: "/",
      accessToken: token,
      tag: "vague-test",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur" }));
    return { ok: false, error: err.error ?? `HTTP ${res.status}` };
  }
  const data = await res.json();
  return { ok: true, sent: data.sent };
}

export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

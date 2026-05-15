// Vague service worker — shell caching + network-first for API/data
const SHELL_CACHE = "vague-shell-v10";
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-icon.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {})
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache Supabase or Anthropic API — always fresh
  if (url.hostname.includes("supabase.co") || url.hostname.includes("anthropic.com")) {
    return;
  }

  // Same-origin only
  if (url.origin !== self.location.origin) return;

  // Never cache Next.js internal endpoints
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/webpack-hmr")) {
    return;
  }

  // Network-first for HTML pages
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Stale-while-revalidate for everything else (assets, images)
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Allow manual update from client
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

// === Push notifications ===
self.addEventListener("push", (event) => {
  let data = { title: "Vague", body: "", url: "/", tag: "vague-notification" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    tag: data.tag,
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || "/" },
    actions: data.actions || undefined,
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || "/";
  const isReminder = data.kind === "reminder";
  const action = event.action; // "done" | "snooze1h" | "snooze-tomorrow" | "" (body click)

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // If a reminder action was clicked, try to notify open clients
      if (isReminder && action && data.taskId) {
        const msg = { kind: "notif-action", taskId: data.taskId, action };
        if (clientsList.length > 0) {
          for (const c of clientsList) c.postMessage(msg);
          // Still focus the app so user sees the change
          const focusable = clientsList.find((c) => "focus" in c);
          if (focusable) return focusable.focus();
        } else {
          // No client open — queue the action via URL param
          const url = `/?task=${encodeURIComponent(data.taskId)}&action=${encodeURIComponent(action)}`;
          if (self.clients.openWindow) return self.clients.openWindow(url);
        }
        return;
      }

      // Default: open / focus the app
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    })()
  );
});

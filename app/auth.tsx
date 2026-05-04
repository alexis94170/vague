"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  sendMagicLink: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

// Synchronously read the Supabase session for instant boot.
// Tries cookies (preferred) then localStorage (legacy migration).
function readLocalSession(): User | null {
  if (typeof window === "undefined") return null;
  try {
    // 1) Try Supabase cookies (set by @supabase/ssr createBrowserClient)
    //    Format: sb-<project-ref>-auth-token=<base64-encoded-json>
    const cookies = document.cookie.split(";").map((s) => s.trim());
    for (const c of cookies) {
      const eq = c.indexOf("=");
      if (eq < 0) continue;
      const name = c.slice(0, eq);
      if (!name.startsWith("sb-") || !name.endsWith("-auth-token")) continue;
      const value = decodeURIComponent(c.slice(eq + 1));
      try {
        // SSR cookie may be base64-prefixed: "base64-<...>"
        const json = value.startsWith("base64-")
          ? atob(value.slice(7))
          : value;
        const parsed = JSON.parse(json) as { user?: User; expires_at?: number };
        if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) continue;
        if (parsed.user) return parsed.user;
      } catch {
        // some clients chunk the cookie — fallthrough to localStorage
      }
    }
    // 2) Legacy localStorage fallback
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { user?: User; expires_at?: number };
      if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) continue;
      if (parsed.user) return parsed.user;
    }
  } catch {}
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initial state comes from cookies/localStorage — no async wait at boot
  const [user, setUser] = useState<User | null>(() => readLocalSession());
  const [loading, setLoading] = useState(() => readLocalSession() === null);

  useEffect(() => {
    const sb = supabase();

    // Migrate legacy localStorage session into cookie-based session
    (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (!data.session) {
          // Look for legacy localStorage tokens and migrate
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
              if (parsed.access_token && parsed.refresh_token) {
                await sb.auth.setSession({
                  access_token: parsed.access_token,
                  refresh_token: parsed.refresh_token,
                });
                // Clean up legacy entry
                localStorage.removeItem(k);
              }
            } catch {}
          }
        }
        const { data: refreshed } = await sb.auth.getSession();
        setUser(refreshed.session?.user ?? null);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    })();

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    return { error: error?.message };
  }

  async function signUpWithPassword(email: string, password: string) {
    const { data, error } = await supabase().auth.signUp({ email, password });
    if (error) return { error: error.message };
    return { needsConfirm: !data.session };
  }

  async function sendMagicLink(email: string) {
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    return { error: error?.message };
  }

  async function signOut() {
    await supabase().auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithPassword, signUpWithPassword, sendMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

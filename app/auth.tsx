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

// Synchronously read the Supabase session from localStorage for instant boot.
// Avoids the async round-trip of getUser()/getSession() before showing UI.
function readLocalSession(): User | null {
  if (typeof window === "undefined") return null;
  try {
    // Supabase JS stores the session under keys like "sb-<project-ref>-auth-token"
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { user?: User; expires_at?: number };
      // Check expiry if present
      if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) continue;
      if (parsed.user) return parsed.user;
    }
  } catch {}
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initial state comes from localStorage — no async wait at boot
  const [user, setUser] = useState<User | null>(() => readLocalSession());
  // If we already have a session from localStorage, we're not "loading"
  const [loading, setLoading] = useState(() => readLocalSession() === null);

  useEffect(() => {
    const sb = supabase();
    // Fast path: getSession() reads from local storage, returns ~instantly
    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));

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

"use client";

import { ReactNode } from "react";
import { useAuth } from "./auth";
import Login from "./components/Login";

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <div className="flex flex-col items-center gap-3 anim-fade-in">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--text)] text-[var(--bg)]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12c2-4 5-4 7 0s5 4 7 0 4-4 4-4" />
          </svg>
        </div>
        <span className="text-[13px] font-medium tracking-tight text-[var(--text-muted)]">Vague</span>
      </div>
    </div>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  // If loading but no cached user at all → splash (rare — only first ever visit)
  if (loading && !user) return <Splash />;

  // No user → show login
  if (!user) return <Login />;

  // User detected (from cache or fresh) → render immediately
  return <>{children}</>;
}

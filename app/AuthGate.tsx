"use client";

import { ReactNode } from "react";
import { useAuth } from "./auth";
import Login from "./components/Login";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="flex items-center gap-3 text-[13px] text-[var(--text-muted)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          Chargement…
        </div>
      </div>
    );
  }

  if (!user) return <Login />;
  return <>{children}</>;
}

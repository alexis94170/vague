"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

type Toast = {
  id: string;
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
  tone?: "default" | "success" | "warning" | "error";
};

type Ctx = {
  show: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    const full: Toast = { duration: 5000, tone: "default", ...t, id };
    setToasts((prev) => [...prev, full]);
    const timer = setTimeout(() => dismiss(id), full.duration!);
    timers.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)" }}
    >
      {toasts.slice(-3).map((t) => {
        const toneCls =
          t.tone === "success" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : t.tone === "warning" ? "border-amber-400/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : t.tone === "error" ? "border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-[var(--border-strong)] bg-[var(--bg-elev)] text-[var(--text)]";
        return (
          <div
            key={t.id}
            className={`pointer-events-auto anim-fade-up flex min-h-[44px] w-full max-w-md items-center gap-3 rounded-full border px-4 py-2 shadow-lg backdrop-blur ${toneCls}`}
          >
            <span className="flex-1 text-[13px] leading-snug">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-1 text-[11.5px] font-semibold text-white transition active:scale-95"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              aria-label="Fermer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

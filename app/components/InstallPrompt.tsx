"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "vague:install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return false;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    // Android / Chrome — beforeinstallprompt
    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    }
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari — no install event, show manual hint after a delay
    if (isIOS()) {
      const timer = setTimeout(() => setShowIosHint(true), 10000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setShow(false);
    }
    setDeferredPrompt(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
    setShowIosHint(false);
  }

  if (!show && !showIosHint) return null;

  return (
    <div
      className="fixed left-1/2 z-[70] w-full max-w-[360px] -translate-x-1/2 px-3 anim-fade-up"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}
    >
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] shadow-xl">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-fg)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12c2-4 5-4 7 0s5 4 7 0 4-4 4-4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">Installer Vague</div>
            {showIosHint ? (
              <div className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
                Touche <span className="inline-flex h-4 w-4 translate-y-0.5 items-center justify-center rounded bg-[var(--bg-hover)]">⬆</span> en bas de Safari puis <b>Sur l&apos;écran d&apos;accueil</b>.
              </div>
            ) : (
              <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">Ajoute Vague à ton écran d&apos;accueil — se lance comme une vraie app.</div>
            )}
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 rounded-full p-1 text-[var(--text-subtle)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            aria-label="Plus tard"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        {!showIosHint && deferredPrompt && (
          <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-2.5">
            <button
              onClick={dismiss}
              className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            >
              Plus tard
            </button>
            <button
              onClick={install}
              className="ml-auto rounded-md bg-[var(--accent)] px-4 py-1.5 text-[12.5px] font-semibold text-white transition active:scale-95"
            >
              Installer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

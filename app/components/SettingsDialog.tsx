"use client";

import { PALETTE_INFO, ThemeMode, ThemePalette, useTheme } from "../theme";
import Icon from "./Icon";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SettingsDialog({ open, onClose }: Props) {
  const { mode, palette, setMode, setPalette } = useTheme();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4 anim-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-[var(--bg-elev)] shadow-2xl anim-scale-in sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-[var(--border)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 safe-top">
          <h2 className="text-[17px] font-semibold">Réglages</h2>
          <button onClick={onClose} className="tappable flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Apparence */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Apparence</h3>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "light" as ThemeMode, label: "Clair", icon: "sun" as const },
                { v: "dark" as ThemeMode, label: "Sombre", icon: "menu" as const },
                { v: "system" as ThemeMode, label: "Auto", icon: "repeat" as const },
              ]).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setMode(o.v)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-[12px] font-medium transition active:scale-95 ${
                    mode === o.v
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]"
                  }`}
                >
                  <Icon name={o.icon} size={18} />
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          {/* Couleur d'accent */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Couleur d&apos;accent</h3>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(PALETTE_INFO) as ThemePalette[]).map((p) => {
                const info = PALETTE_INFO[p];
                const active = palette === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPalette(p)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition active:scale-95 ${
                      active
                        ? "border-[var(--border-strong)] bg-[var(--bg-hover)]"
                        : "border-[var(--border)] bg-[var(--bg)]"
                    }`}
                  >
                    <span
                      className="relative h-8 w-8 rounded-full shadow-sm"
                      style={{ background: info.color }}
                    >
                      {active && (
                        <span className="absolute inset-0 flex items-center justify-center text-white">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium">{info.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* À propos */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">À propos</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12c2-4 5-4 7 0s5 4 7 0 4-4 4-4" />
                  </svg>
                </div>
                <div>
                  <div className="text-[14px] font-semibold">Vague</div>
                  <div className="text-[11.5px] text-[var(--text-muted)]">Gestion de tâches · sync temps réel</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { PALETTE_INFO, ThemeMode, ThemePalette, useTheme } from "../theme";
import { notificationPermission, requestNotificationPermission } from "./Notifications";
import { isPushSupported, isSubscribed, sendTestPush, subscribeToPush, unsubscribeFromPush } from "../lib/push-client";
import { clearAiCost, getAiCostSummary } from "../lib/ai-cost-tracker";
import { useGoogle } from "../google";
import Icon from "./Icon";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SettingsDialog({ open, onClose }: Props) {
  const { mode, palette, setMode, setPalette } = useTheme();
  const google = useGoogle();
  const [notifPerm, setNotifPerm] = useState<string>("default");
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [aiCost, setAiCost] = useState(() => getAiCostSummary());
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setNotifPerm(notificationPermission());
      isSubscribed().then(setPushOn);
      setAiCost(getAiCostSummary());
      google.refreshStatus();
    }
  }, [open]);

  async function disconnectGoogle() {
    if (!confirm("Déconnecter Google Calendar ?")) return;
    setGoogleBusy(true);
    try {
      await google.disconnect();
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleNotifToggle() {
    const result = await requestNotificationPermission();
    setNotifPerm(result);
  }

  async function togglePush() {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
        setPushMsg("Notifications push désactivées");
      } else {
        const r = await subscribeToPush();
        if (r.ok) {
          setPushOn(true);
          setPushMsg("Notifications push activées 🌊");
        } else {
          setPushMsg(r.error ?? "Échec");
        }
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function testPush() {
    setPushBusy(true);
    setPushMsg(null);
    try {
      const r = await sendTestPush();
      if (r.ok) setPushMsg(`Notification envoyée (${r.sent})`);
      else setPushMsg(r.error ?? "Échec");
    } finally {
      setPushBusy(false);
    }
  }

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

          {/* Notifications locales */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Rappels locaux</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">Rappels pour les échéances du jour</div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                    {notifPerm === "granted" && "Activé. Fonctionne uniquement quand l'app est ouverte."}
                    {notifPerm === "denied" && "Bloqué. Active-le dans les réglages du navigateur."}
                    {notifPerm === "default" && "Autorise pour recevoir les rappels quand l'app est ouverte."}
                    {notifPerm === "unsupported" && "Non supporté sur ce navigateur."}
                  </div>
                </div>
                {notifPerm === "default" && (
                  <button
                    onClick={handleNotifToggle}
                    className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white"
                  >
                    Activer
                  </button>
                )}
                {notifPerm === "granted" && (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-300">
                    Activé
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Push notifications */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Notifications push</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">Recevoir les rappels même app fermée</div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                    {!isPushSupported() && "Non supporté sur ce navigateur. Installe Vague pour y accéder."}
                    {isPushSupported() && pushOn && "Tu recevras les rappels sur tous tes appareils abonnés."}
                    {isPushSupported() && !pushOn && "Active pour recevoir les rappels importants (retards, planification quotidienne)."}
                  </div>
                </div>
                {isPushSupported() && (
                  <button
                    onClick={togglePush}
                    disabled={pushBusy}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-50 ${
                      pushOn
                        ? "bg-[var(--bg-hover)] text-[var(--text)]"
                        : "bg-[var(--accent)] text-white"
                    }`}
                  >
                    {pushBusy ? "…" : pushOn ? "Désactiver" : "Activer"}
                  </button>
                )}
              </div>
              {pushOn && (
                <div className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-3">
                  <button
                    onClick={testPush}
                    disabled={pushBusy}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
                  >
                    Envoyer un test
                  </button>
                </div>
              )}
              {pushMsg && (
                <div className="mt-2 text-[11px] text-[var(--accent)]">{pushMsg}</div>
              )}
            </div>
          </section>

          {/* Google Calendar */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Agenda Google</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">Google Calendar</div>
                    <div className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">
                      {google.status?.connected
                        ? `Connecté · ${google.status.email ?? "compte Google"}`
                        : "Voir tes événements et créer des plages depuis tes tâches"}
                    </div>
                  </div>
                </div>
                {google.status?.connected ? (
                  <button
                    onClick={disconnectGoogle}
                    disabled={googleBusy}
                    className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
                  >
                    Déconnecter
                  </button>
                ) : (
                  <a
                    href="/api/google/auth"
                    className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent-fg)] transition active:scale-95"
                  >
                    Connecter
                  </a>
                )}
              </div>
              {google.status?.connected && google.error && (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300">
                  {google.error}
                </div>
              )}
              {google.status?.connected && (
                <div className="mt-3 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-subtle)]">
                  {google.events.length > 0
                    ? `${google.events.length} événement${google.events.length > 1 ? "s" : ""} sur les 60 prochains jours`
                    : "Aucun événement chargé pour le moment"}
                </div>
              )}
            </div>
          </section>

          {/* Utilisation IA */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Utilisation IA</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-subtle)]">Aujourd&apos;hui</div>
                  <div className="mt-1 text-[18px] font-semibold tabular-nums">{aiCost.today < 0.01 ? "< 0,01 $" : `${aiCost.today.toFixed(2)} $`}</div>
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-subtle)]">7 jours</div>
                  <div className="mt-1 text-[18px] font-semibold tabular-nums">{aiCost.last7d < 0.01 ? "< 0,01 $" : `${aiCost.last7d.toFixed(2)} $`}</div>
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-subtle)]">Total</div>
                  <div className="mt-1 text-[18px] font-semibold tabular-nums">{aiCost.total < 0.01 ? "< 0,01 $" : `${aiCost.total.toFixed(2)} $`}</div>
                </div>
              </div>
              {Object.keys(aiCost.byEndpoint).length > 0 && (
                <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
                  {Object.entries(aiCost.byEndpoint).map(([ep, d]) => (
                    <div key={ep} className="flex items-center justify-between text-[11.5px] text-[var(--text-muted)]">
                      <span>{ep} <span className="text-[var(--text-subtle)]">· {d.count} appel{d.count > 1 ? "s" : ""}</span></span>
                      <span className="tabular-nums">{d.cost < 0.01 ? "< 0,01 $" : `${d.cost.toFixed(3)} $`}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                <div className="text-[11px] text-[var(--text-subtle)]">
                  Budget max : <strong>1 $ / jour</strong> · reset minuit UTC
                </div>
                {aiCost.count > 0 && (
                  <button
                    onClick={() => { clearAiCost(); setAiCost(getAiCostSummary()); }}
                    className="text-[11px] text-[var(--text-muted)] hover:text-rose-600"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* À propos */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">À propos</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-fg)]">
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

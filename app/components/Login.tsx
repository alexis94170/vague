"use client";

import { useState } from "react";
import { useAuth } from "../auth";
import Icon from "./Icon";

type Mode = "signin" | "signup" | "magic";

export default function Login() {
  const { signInWithPassword, signUpWithPassword, sendMagicLink } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await signInWithPassword(email, password);
        if (error) setError(error);
      } else if (mode === "signup") {
        const { error, needsConfirm } = await signUpWithPassword(email, password);
        if (error) setError(error);
        else if (needsConfirm) setInfo("Vérifie ta boîte mail pour confirmer ton compte.");
      } else {
        const { error } = await sendMagicLink(email);
        if (error) setError(error);
        else setInfo("Lien envoyé. Ouvre-le depuis ta boîte mail pour te connecter.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12c2-4 5-4 7 0s5 4 7 0 4-4 4-4" />
            </svg>
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight">Vague</h1>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-6 shadow-sm">
          <h2 className="text-[15px] font-semibold">
            {mode === "signin" ? "Connexion" : mode === "signup" ? "Créer un compte" : "Connexion par email"}
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
            {mode === "signin"
              ? "Retrouve tes tâches, synchronisées sur tous tes appareils."
              : mode === "signup"
                ? "En 30 secondes, et c'est gratuit."
                : "Reçois un lien magique pour te connecter sans mot de passe."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@exemple.com"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] outline-none transition focus:border-[var(--accent)]/50"
              />
            </div>
            {mode !== "magic" && (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
                  Mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] outline-none transition focus:border-[var(--accent)]/50"
                />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300">
                {error}
              </div>
            )}
            {info && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {loading ? "…" : (
                <>
                  <span>
                    {mode === "signin" ? "Se connecter" : mode === "signup" ? "Créer le compte" : "Envoyer le lien"}
                  </span>
                  <Icon name="arrow-right" size={14} />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-1 text-center text-[12px]">
            {mode === "signin" && (
              <>
                <button
                  type="button"
                  onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
                  className="text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  Pas encore de compte ? <span className="font-medium">Créer un compte</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("magic"); setError(null); setInfo(null); }}
                  className="text-[var(--text-subtle)] hover:text-[var(--accent)]"
                >
                  Ou connexion par lien email
                </button>
              </>
            )}
            {mode === "signup" && (
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                className="text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                Déjà un compte ? <span className="font-medium">Se connecter</span>
              </button>
            )}
            {mode === "magic" && (
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                className="text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                Retour à la connexion par mot de passe
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-[var(--text-subtle)]">
          Tes données sont stockées de manière sécurisée et t'appartiennent.
        </p>
      </div>
    </div>
  );
}

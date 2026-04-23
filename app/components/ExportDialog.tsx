"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { exportState, importState, normalizeIds } from "../lib/storage";
import { AppState } from "../lib/types";
import { loadBackups, deleteBackup } from "../lib/auto-backup";
import { useToast } from "../toast";

type Props = {
  open: boolean;
  onClose: () => void;
};

const LOCAL_KEY = "vague:state:v2";

type LocalPreview = { state: AppState; taskCount: number; projectCount: number } | null;

export default function ExportDialog({ open, onClose }: Props) {
  const { state, replaceState, mergeImport } = useStore();
  const toast = useToast();
  const [mode, setMode] = useState<"export" | "import" | "history">("export");
  const [backups, setBackups] = useState(loadBackups());
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<LocalPreview>(null);

  const json = useMemo(() => exportState(state), [state]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    setBackups(loadBackups());
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return setLocalPreview(null);
      const parsed = JSON.parse(raw) as AppState;
      if (parsed?.version === 2 && Array.isArray(parsed.tasks)) {
        setLocalPreview({
          state: parsed,
          taskCount: parsed.tasks.length,
          projectCount: parsed.projects.length,
        });
      }
    } catch {
      setLocalPreview(null);
    }
  }, [open]);

  function restoreFromBackup(ts: number) {
    const b = backups.find((x) => x.ts === ts);
    if (!b) return;
    if (!confirm(`Restaurer la sauvegarde du ${b.date} ? ${b.tasks.length} tâches seront ajoutées (pas de remplacement).`)) return;
    const normalized = normalizeIds({
      version: 2,
      projects: b.projects,
      tasks: b.tasks,
      settings: { theme: "system" },
    });
    mergeImport(normalized.projects, normalized.tasks);
    toast.show({ message: `Sauvegarde du ${b.date} restaurée`, tone: "success" });
    setTimeout(onClose, 800);
  }

  if (!open) return null;

  function downloadBackup() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vague-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyJSON() {
    navigator.clipboard.writeText(json);
  }

  function doImport() {
    setImportError(null);
    setImportInfo(null);
    const parsed = importState(importText);
    if (!parsed) {
      setImportError("Fichier invalide (format Vague v2 attendu).");
      return;
    }
    if (!confirm(`Ajouter ${parsed.tasks.length} tâche(s) et ${parsed.projects.length} projet(s) à ton compte ?`)) return;
    mergeImport(parsed.projects, parsed.tasks);
    setImportInfo(`${parsed.tasks.length} tâche(s) importée(s).`);
    setImportText("");
    setTimeout(onClose, 1200);
  }

  function importFromBrowser() {
    if (!localPreview) return;
    const normalized = normalizeIds(localPreview.state);
    if (!confirm(`Importer ${normalized.tasks.length} tâche(s) et ${normalized.projects.length} projet(s) depuis le navigateur ? Elles seront ajoutées à ton compte.`)) return;
    mergeImport(normalized.projects, normalized.tasks);
    setImportInfo(`${normalized.tasks.length} tâche(s) importée(s) depuis le navigateur.`);
    setTimeout(onClose, 1500);
  }

  function importFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-[var(--bg-elev)] shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl sm:border sm:border-[var(--border)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex gap-1">
            <button
              onClick={() => setMode("export")}
              className={`rounded px-2.5 py-1 text-sm ${
                mode === "export" ? "bg-[var(--bg-hover)] font-medium" : "text-[var(--text-muted)]"
              }`}
            >
              Exporter
            </button>
            <button
              onClick={() => setMode("import")}
              className={`rounded px-2.5 py-1 text-sm ${
                mode === "import" ? "bg-[var(--bg-hover)] font-medium" : "text-[var(--text-muted)]"
              }`}
            >
              Restaurer
            </button>
            <button
              onClick={() => setMode("history")}
              className={`rounded px-2.5 py-1 text-sm ${
                mode === "history" ? "bg-[var(--bg-hover)] font-medium" : "text-[var(--text-muted)]"
              }`}
            >
              Historique
            </button>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm hover:bg-[var(--bg-hover)]">✕</button>
        </div>

        <div className="px-4 py-4">
          {mode === "history" ? (
            <>
              <div className="text-[12.5px] text-[var(--text-muted)]">
                Sauvegardes quotidiennes automatiques de tes données (dans ton navigateur). Restaure à tout moment.
              </div>
              <div className="mt-3 space-y-2">
                {backups.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-[12.5px] text-[var(--text-subtle)]">
                    Aucune sauvegarde pour l&apos;instant. Elles se créent automatiquement une fois par jour.
                  </div>
                ) : (
                  [...backups].reverse().map((b) => {
                    const date = new Date(b.ts);
                    return (
                      <div key={b.ts} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                        <div className="flex-1">
                          <div className="text-[13px] font-medium">
                            {date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                          </div>
                          <div className="text-[11.5px] text-[var(--text-muted)]">
                            {b.tasks.length} tâche{b.tasks.length > 1 ? "s" : ""} · {b.projects.length} projet{b.projects.length > 1 ? "s" : ""} · {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <button
                          onClick={() => restoreFromBackup(b.ts)}
                          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11.5px] font-medium text-white"
                        >
                          Restaurer
                        </button>
                        <button
                          onClick={() => {
                            deleteBackup(b.ts);
                            setBackups(loadBackups());
                          }}
                          className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] p-1.5 text-[var(--text-subtle)] hover:text-rose-600"
                          aria-label="Supprimer"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : mode === "export" ? (
            <>
              <div className="text-xs text-[var(--text-muted)]">
                Sauvegarde complète de tes projets et tâches au format JSON.
              </div>
              <textarea
                readOnly
                value={json}
                rows={10}
                className="mt-3 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-[11px]"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={downloadBackup}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
                >
                  Télécharger .json
                </button>
                <button
                  onClick={copyJSON}
                  className="rounded-md bg-[var(--bg-hover)] px-3 py-1.5 text-sm hover:opacity-80"
                >
                  Copier
                </button>
              </div>
            </>
          ) : (
            <>
              {localPreview && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
                  <div className="text-[12.5px] font-medium text-amber-900 dark:text-amber-200">
                    Données locales détectées
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-amber-800 dark:text-amber-300">
                    {localPreview.taskCount} tâche(s) et {localPreview.projectCount} projet(s) trouvés dans ce navigateur.
                  </div>
                  <button
                    onClick={importFromBrowser}
                    className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
                  >
                    ↑ Importer vers mon compte
                  </button>
                </div>
              )}

              <div className="text-xs text-[var(--text-muted)]">
                Ou colle un fichier de backup Vague (.json) ci-dessous. Les tâches seront ajoutées à ton compte, pas remplacées.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]">
                  Choisir un fichier .json…
                  <input type="file" accept=".json,application/json" onChange={importFromFile} className="hidden" />
                </label>
                <span className="text-[11px] text-[var(--text-subtle)]">ou colle le contenu :</span>
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
                className="mt-2 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-[11px]"
              />
              {importError && <div className="mt-2 text-xs text-rose-600">{importError}</div>}
              {importInfo && <div className="mt-2 text-xs text-emerald-600">{importInfo}</div>}
              <div className="mt-3">
                <button
                  onClick={doImport}
                  disabled={!importText.trim()}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  Importer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

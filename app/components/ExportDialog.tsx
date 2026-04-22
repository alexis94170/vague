"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { exportState, importState, normalizeIds } from "../lib/storage";
import { AppState } from "../lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
};

const LOCAL_KEY = "vague:state:v2";

type LocalPreview = { state: AppState; taskCount: number; projectCount: number } | null;

export default function ExportDialog({ open, onClose }: Props) {
  const { state, replaceState, mergeImport } = useStore();
  const [mode, setMode] = useState<"export" | "import">("export");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<LocalPreview>(null);

  const json = useMemo(() => exportState(state), [state]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] shadow-2xl"
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
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm hover:bg-[var(--bg-hover)]">✕</button>
        </div>

        <div className="px-4 py-4">
          {mode === "export" ? (
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

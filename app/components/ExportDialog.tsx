"use client";

import { useMemo, useState } from "react";
import { useStore } from "../store";
import { exportState, importState } from "../lib/storage";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ExportDialog({ open, onClose }: Props) {
  const { state, replaceState } = useStore();
  const [mode, setMode] = useState<"export" | "import">("export");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const json = useMemo(() => exportState(state), [state]);

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
    const parsed = importState(importText);
    if (!parsed) {
      setImportError("Fichier invalide (format Vague v2 attendu).");
      return;
    }
    if (!confirm("Remplacer toutes les tâches actuelles par celles du backup ?")) return;
    replaceState(parsed);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex gap-1">
            <button
              onClick={() => setMode("export")}
              className={`rounded px-2.5 py-1 text-sm ${
                mode === "export" ? "bg-zinc-200 font-medium dark:bg-zinc-800" : "text-zinc-500"
              }`}
            >
              Exporter
            </button>
            <button
              onClick={() => setMode("import")}
              className={`rounded px-2.5 py-1 text-sm ${
                mode === "import" ? "bg-zinc-200 font-medium dark:bg-zinc-800" : "text-zinc-500"
              }`}
            >
              Restaurer
            </button>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">✕</button>
        </div>

        <div className="px-4 py-4">
          {mode === "export" ? (
            <>
              <div className="text-xs text-zinc-500">
                Sauvegarde complète de tes projets et tâches au format JSON.
              </div>
              <textarea
                readOnly
                value={json}
                rows={10}
                className="mt-3 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={downloadBackup}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Télécharger .json
                </button>
                <button
                  onClick={copyJSON}
                  className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  Copier
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-zinc-500">
                Colle ici le contenu d'un fichier de backup Vague pour remplacer tes données actuelles.
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={10}
                className="mt-3 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
              />
              {importError && (
                <div className="mt-2 text-xs text-rose-600">{importError}</div>
              )}
              <div className="mt-3">
                <button
                  onClick={doImport}
                  disabled={!importText.trim()}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Restaurer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

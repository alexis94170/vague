"use client";

import { useRef, useState } from "react";
import { useStore } from "../store";
import { parseInput } from "../lib/parser";
import {
  XlsxPreview,
  XlsxSheet,
  buildImport,
  readXlsxFile,
} from "../lib/xlsxImport";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Mode = "xlsx" | "text";

export default function ImportDialog({ open, onClose }: Props) {
  const { projects, addProject, addTaskFromParsed, bulkAddTasks, mergeImport } = useStore();
  const [mode, setMode] = useState<Mode>("xlsx");
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [useNL, setUseNL] = useState(true);
  const [preview, setPreview] = useState<XlsxPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  async function onFileChosen(f: File) {
    setError(null);
    setLoading(true);
    try {
      const p = await readXlsxFile(f);
      setPreview(p);
    } catch (e) {
      setError("Impossible de lire le fichier. Format Excel (.xlsx/.xls) attendu.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function updateSheetDetect(i: number, patch: Partial<XlsxSheet["detected"]>) {
    if (!preview) return;
    const next = { ...preview };
    next.sheets = preview.sheets.map((s, idx) =>
      idx === i ? { ...s, detected: { ...s.detected, ...patch } } : s
    );
    setPreview(next);
  }

  function confirmXlsxImport() {
    if (!preview) return;
    const { projects: np, tasks: nt } = buildImport(preview);
    if (nt.length === 0) {
      setError("Aucune tâche détectée. Vérifie que la colonne « Tâche » est bien choisie.");
      return;
    }
    mergeImport(np, nt);
    resetAndClose();
  }

  function submitText() {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    if (useNL) {
      lines.forEach((line) => {
        addTaskFromParsed(parseInput(line, projects), projectId || undefined);
      });
    } else {
      bulkAddTasks(lines, projectId || undefined);
    }
    setText("");
    resetAndClose();
  }

  function resetAndClose() {
    setPreview(null);
    setError(null);
    setText("");
    onClose();
  }

  const totalRowsDetected = preview
    ? preview.sheets.reduce((acc, s) => {
        if (!s.detected.title) return acc;
        const key = s.detected.title;
        return acc + s.rows.filter((r) => String(r[key] ?? "").trim()).length;
      }, 0)
    : 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={resetAndClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-zinc-900 sm:max-h-[85vh] sm:max-w-2xl sm:rounded-xl sm:border sm:border-zinc-200 sm:dark:border-zinc-800"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex gap-1">
            <button
              onClick={() => setMode("xlsx")}
              className={`rounded px-2.5 py-1 text-sm ${mode === "xlsx" ? "bg-zinc-200 font-medium dark:bg-zinc-800" : "text-zinc-500"}`}
            >
              Fichier Excel
            </button>
            <button
              onClick={() => setMode("text")}
              className={`rounded px-2.5 py-1 text-sm ${mode === "text" ? "bg-zinc-200 font-medium dark:bg-zinc-800" : "text-zinc-500"}`}
            >
              Texte collé
            </button>
          </div>
          <button onClick={resetAndClose} className="rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">✕</button>
        </div>

        {mode === "xlsx" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {!preview ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="text-sm text-zinc-500">
                    Importe un fichier Excel (.xlsx/.xls). Chaque feuille devient un projet.
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.xlsm"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFileChosen(f);
                    }}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={loading}
                    className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {loading ? "Lecture…" : "Choisir un fichier"}
                  </button>
                  <div className="text-xs text-zinc-400">
                    Colonnes reconnues automatiquement : Tâche, Priorité, Catégorie, Notes, Statut, Échéance
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-3 text-xs text-zinc-500">
                    <strong>{preview.sheets.length}</strong> feuille{preview.sheets.length > 1 ? "s" : ""} détectée{preview.sheets.length > 1 ? "s" : ""}.
                    Vérifie le mapping des colonnes pour chacune :
                  </div>
                  <div className="space-y-4">
                    {preview.sheets.map((s, i) => {
                      const headers = s.rows.length > 0 ? Object.keys(s.rows[0]) : [];
                      const validRows = s.detected.title
                        ? s.rows.filter((r) => String(r[s.detected.title!] ?? "").trim()).length
                        : 0;
                      return (
                        <div key={i} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-medium">{s.name}</div>
                            <div className="text-xs text-zinc-500">
                              {validRows} tâche{validRows !== 1 ? "s" : ""}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                            <ColumnSelect label="Tâche *" required value={s.detected.title} headers={headers} onChange={(v) => updateSheetDetect(i, { title: v })} />
                            <ColumnSelect label="Priorité" value={s.detected.priority} headers={headers} onChange={(v) => updateSheetDetect(i, { priority: v })} />
                            <ColumnSelect label="Catégorie" value={s.detected.category} headers={headers} onChange={(v) => updateSheetDetect(i, { category: v })} />
                            <ColumnSelect label="Notes" value={s.detected.notes} headers={headers} onChange={(v) => updateSheetDetect(i, { notes: v })} />
                            <ColumnSelect label="Statut" value={s.detected.status} headers={headers} onChange={(v) => updateSheetDetect(i, { status: v })} />
                            <ColumnSelect label="Échéance" value={s.detected.dueDate} headers={headers} onChange={(v) => updateSheetDetect(i, { dueDate: v })} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {error && <div className="mt-3 text-xs text-rose-600">{error}</div>}
            </div>

            {preview && (
              <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <span className="text-xs text-zinc-500">
                  {totalRowsDetected} tâche{totalRowsDetected !== 1 ? "s" : ""} prête{totalRowsDetected !== 1 ? "s" : ""} à importer
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreview(null)}
                    className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Changer de fichier
                  </button>
                  <button
                    onClick={confirmXlsxImport}
                    disabled={totalRowsDetected === 0}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    Importer
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 px-4 py-4">
            <div className="text-xs text-zinc-500">
              Colle une liste de tâches, une par ligne. Avec la syntaxe naturelle : <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">#projet @tag !haute ~30min demain 14h</code>.
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              autoFocus
              placeholder={"Appeler le plombier demain 10h #maison\nRelire contrat !haute\nCourses @urgent ~30min"}
              className="w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" checked={useNL} onChange={(e) => setUseNL(e.target.checked)} />
                Syntaxe naturelle (#projet @tag !priorité)
              </label>
              <div className="ml-auto flex items-center gap-2 text-xs">
                <span className="text-zinc-500">Projet par défaut :</span>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                  <option value="">Aucun</option>
                  {projects.filter((p) => p.id !== "inbox").map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const name = prompt("Nom du nouveau projet ?");
                    if (name && name.trim()) {
                      const p = addProject(name.trim());
                      setProjectId(p.id);
                    }
                  }}
                  className="rounded bg-zinc-100 px-2 py-1 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  + Nouveau
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end pt-2">
              <button
                onClick={submitText}
                disabled={!text.trim()}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Importer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  headers,
  onChange,
  required,
}: {
  label: string;
  value?: string;
  headers: string[];
  onChange: (v: string | undefined) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={`text-[11px] font-medium ${required && !value ? "text-rose-600" : "text-zinc-500"}`}>
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full rounded bg-zinc-100 px-2 py-1 text-xs outline-none dark:bg-zinc-800"
      >
        <option value="">— aucune —</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { ViewKind } from "../lib/views";

type Props = {
  onNavigate: (v: ViewKind) => void;
  onNewTask: () => void;
  onSearch: () => void;
  onAssistant: () => void;
  onPlan: () => void;
};

const SHORTCUTS = [
  { key: "T", label: "Aujourd'hui" },
  { key: "D", label: "Tableau de bord" },
  { key: "A", label: "Toutes" },
  { key: "C", label: "Calendrier" },
  { key: "W", label: "En attente" },
  { key: "I", label: "À trier (inbox)" },
  { key: "N", label: "Nouvelle tâche" },
  { key: "Ctrl+K", label: "Rechercher" },
  { key: "Ctrl+/", label: "Assistant IA" },
  { key: "Ctrl+J", label: "Planifier ma journée" },
  { key: "?", label: "Ce menu d'aide" },
  { key: "Esc", label: "Fermer" },
];

function isTypingInInput(el: EventTarget | null): boolean {
  if (!el) return false;
  const t = el as HTMLElement;
  return (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable
  );
}

export default function KeyboardShortcuts({ onNavigate, onNewTask, onSearch, onAssistant, onPlan }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingInInput(e.target)) return;

      // ? shows help
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Esc closes help
      if (e.key === "Escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }

      // Ctrl shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          onSearch();
          return;
        }
        if (e.key === "/") {
          e.preventDefault();
          onAssistant();
          return;
        }
        if (e.key.toLowerCase() === "j") {
          e.preventDefault();
          onPlan();
          return;
        }
        return;
      }

      // Single-key navigation
      switch (e.key.toLowerCase()) {
        case "t": e.preventDefault(); onNavigate({ kind: "today" }); break;
        case "d": e.preventDefault(); onNavigate({ kind: "dashboard" }); break;
        case "a": e.preventDefault(); onNavigate({ kind: "all" }); break;
        case "c": e.preventDefault(); onNavigate({ kind: "calendar" }); break;
        case "w": e.preventDefault(); onNavigate({ kind: "waiting" }); break;
        case "i": e.preventDefault(); onNavigate({ kind: "untriaged" }); break;
        case "n": e.preventDefault(); onNewTask(); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNavigate, onNewTask, onSearch, onAssistant, onPlan, helpOpen]);

  if (!helpOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 anim-fade-in" onClick={() => setHelpOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] shadow-2xl anim-scale-in"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-[15px] font-semibold">Raccourcis clavier</h2>
          <button onClick={() => setHelpOpen(false)} className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="flex items-center justify-between">
                <span className="text-[12.5px] text-[var(--text-muted)]">{s.label}</span>
                <kbd className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] font-mono font-medium text-[var(--text)]">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-3 text-[11.5px] text-[var(--text-subtle)]">
            Les raccourcis ne fonctionnent pas quand tu es en train d&apos;écrire dans un champ.
          </div>
        </div>
      </div>
    </div>
  );
}

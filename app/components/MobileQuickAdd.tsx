"use client";

import { useEffect } from "react";
import { ViewKind } from "../lib/views";
import Icon from "./Icon";
import QuickAdd from "./QuickAdd";

type Props = {
  open: boolean;
  onClose: () => void;
  view: ViewKind;
};

export default function MobileQuickAdd({ open, onClose, view }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-black/40 anim-fade-in md:hidden" onClick={onClose}>
      <div className="flex-1" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-slide-up rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg-elev)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-[15px] font-semibold">Nouvelle tâche</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="p-3 pb-6">
          <QuickAdd view={view} onSubmitted={onClose} autoFocus />
        </div>
      </div>
    </div>
  );
}

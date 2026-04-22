"use client";

import { useMemo } from "react";
import { ViewKind } from "../lib/views";
import { useStore } from "../store";
import { todayISO } from "../lib/dates";
import Icon, { IconName } from "./Icon";

type Props = {
  view: ViewKind;
  onViewChange: (v: ViewKind) => void;
  onOpenMore: () => void;
};

type Item = { kind: ViewKind["kind"]; label: string; icon: IconName };

const ITEMS: Item[] = [
  { kind: "today", label: "Aujourd'hui", icon: "sun" },
  { kind: "untriaged", label: "À trier", icon: "inbox" },
  { kind: "all", label: "Toutes", icon: "list" },
  { kind: "waiting", label: "Attente", icon: "pause" },
];

export default function BottomNav({ view, onViewChange, onOpenMore }: Props) {
  const { tasks } = useStore();

  const counts = useMemo(() => {
    const today = todayISO();
    const c = { today: 0, untriaged: 0, all: 0, waiting: 0 };
    tasks.forEach((t) => {
      if (t.done) return;
      if (t.waiting) { c.waiting++; return; }
      c.all++;
      if (!t.projectId || t.projectId === "inbox") c.untriaged++;
      if (t.dueDate && t.dueDate <= today) c.today++;
    });
    return c;
  }, [tasks]);

  function isActive(kind: ViewKind["kind"]): boolean {
    return view.kind === kind;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--bg-elev)]/95 backdrop-blur-lg safe-bottom md:hidden">
      <div className="flex h-16 items-stretch">
        {ITEMS.map((item) => {
          const active = isActive(item.kind);
          const count =
            item.kind === "today" ? counts.today :
            item.kind === "untriaged" ? counts.untriaged :
            item.kind === "all" ? counts.all :
            counts.waiting;
          return (
            <button
              key={item.kind}
              onClick={() => onViewChange({ kind: item.kind } as ViewKind)}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition ${
                active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
              }`}
            >
              <div className="relative">
                <Icon name={item.icon} size={22} />
                {count > 0 && !active && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-semibold text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={onOpenMore}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[var(--text-muted)] transition"
        >
          <Icon name="menu" size={22} />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}

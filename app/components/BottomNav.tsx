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
  { kind: "today", label: "Jour", icon: "sun" },
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] glass-bottom safe-bottom md:hidden">
      <div className="flex h-[56px] items-stretch">
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
              className={`no-select tappable relative flex flex-1 flex-col items-center justify-center gap-0.5 transition active:scale-95 ${
                active ? "text-[var(--text)]" : "text-[var(--text-subtle)]"
              }`}
            >
              <span className="relative flex items-center justify-center">
                <Icon name={item.icon} size={20} />
                {count > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[var(--text)] px-1 text-[9px] font-semibold tabular-nums text-[var(--bg)]">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className="text-[9.5px] font-medium tracking-tight">{item.label}</span>
              {active && (
                <span className="absolute inset-x-6 top-0 h-[2px] rounded-full bg-[var(--accent)]" aria-hidden />
              )}
            </button>
          );
        })}
        <button
          onClick={onOpenMore}
          className="no-select tappable flex flex-1 flex-col items-center justify-center gap-0.5 text-[var(--text-subtle)] transition active:scale-95"
        >
          <Icon name="menu" size={20} />
          <span className="text-[9.5px] font-medium tracking-tight">Menu</span>
        </button>
      </div>
    </nav>
  );
}

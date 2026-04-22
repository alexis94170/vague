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
      <div className="flex h-[58px] items-stretch px-1">
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
              className={`no-select tappable relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition active:scale-95 ${
                active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
              }`}
            >
              <div className="relative flex h-7 items-center justify-center">
                {active && (
                  <span className="absolute inset-x-1 inset-y-0 rounded-full bg-[var(--accent-soft)]" aria-hidden />
                )}
                <span className="relative">
                  <Icon name={item.icon} size={22} />
                  {count > 0 && (
                    <span className={`absolute -right-2.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${
                      active ? "bg-[var(--accent)] text-white" : "bg-rose-500 text-white"
                    }`}>
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </span>
              </div>
              <span className={`text-[10px] font-medium ${active ? "font-semibold" : ""}`}>{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={onOpenMore}
          className="no-select tappable flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[var(--text-muted)] transition active:scale-95"
        >
          <div className="flex h-7 items-center justify-center">
            <Icon name="menu" size={22} />
          </div>
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}

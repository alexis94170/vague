"use client";

import { useEffect, useState } from "react";
import { haptic } from "../lib/haptics";
import Icon from "./Icon";

const STORAGE_KEY = "vague:shopping:v1";

type Item = {
  id: string;
  text: string;
  done: boolean;
  category?: string;
  createdAt: number;
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadItems(): Item[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Item[];
  } catch {
    return [];
  }
}

function saveItems(items: Item[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function detectCategory(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/(pomme|poire|banane|orange|fraise|raisin|salade|tomate|carotte|oignon|courgette|patate|persil|citron|ail|champignon|fruit|legume|épinard|concombre|poivron|aubergine|brocoli|chou|avocat|kiwi|melon|pasteque|peche|abricot|prune|myrtille)/.test(t)) return "Frais";
  if (/(viande|boeuf|bœuf|poulet|porc|veau|agneau|saucisse|jambon|bacon|lardon|cote|filet|escalope|chorizo)/.test(t)) return "Viande";
  if (/(poisson|saumon|cabillaud|thon|sardine|crevette|moule|huitre|crabe)/.test(t)) return "Poisson";
  if (/(lait|yaourt|fromage|beurre|crème|creme|kiri|comte|mozzarella|parmesan|camembert|brie)/.test(t)) return "Crémerie";
  if (/(pain|baguette|brioche|biscotte|croissant)/.test(t)) return "Boulangerie";
  if (/(pâte|pate|riz|farine|sucre|sel|huile|vinaigre|conserve|haricot|lentille|cereale|chocolat|miel|confiture|cafe|café|thé)/.test(t)) return "Épicerie";
  if (/(eau|jus|soda|coca|biere|bière|vin|sirop|limonade)/.test(t)) return "Boissons";
  if (/(papier|essuie|sopalin|liquide|nettoyant|lessive|eponge|sac poubelle|pile|ampoule)/.test(t)) return "Maison";
  if (/(savon|shampoing|gel douche|dentifrice|deodorant|coton)/.test(t)) return "Hygiène";
  return undefined;
}

export default function ShoppingWidget() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  useEffect(() => {
    setItems(loadItems());
  }, []);

  function update(next: Item[]) {
    setItems(next);
    saveItems(next);
  }
  function add(text: string) {
    const t = text.trim();
    if (!t) return;
    update([{ id: uid(), text: t, done: false, category: detectCategory(t), createdAt: Date.now() }, ...items]);
    setInput("");
    haptic("light");
  }
  function toggle(id: string) {
    update(items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
    haptic("medium");
  }
  function remove(id: string) {
    update(items.filter((it) => it.id !== id));
  }
  function clearDone() {
    if (!confirm("Vider les articles cochés ?")) return;
    update(items.filter((it) => !it.done));
    haptic("success");
  }

  const remaining = items.filter((it) => !it.done);
  const done = items.filter((it) => it.done);

  // Group remaining by category
  const groups: Record<string, Item[]> = {};
  for (const it of remaining) {
    const c = it.category || "Autre";
    if (!groups[c]) groups[c] = [];
    groups[c].push(it);
  }
  const orderedCats = Object.keys(groups).sort();

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-[18px]">
          🛒
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-[var(--text)]">Courses</div>
          <div className="truncate text-[11.5px] text-[var(--text-muted)]">
            {remaining.length === 0 ? "Aucun article" : `${remaining.length} article${remaining.length > 1 ? "s" : ""}${done.length > 0 ? ` · ${done.length} dans le panier` : ""}`}
          </div>
        </div>
        <Icon name="chevron-right" size={14} className={`shrink-0 text-[var(--text-subtle)] transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-5 py-4">
          {/* Add input */}
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
            <Icon name="plus" size={13} className="shrink-0 text-[var(--text-subtle)]" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  add(input);
                }
              }}
              placeholder="Ajouter un article…"
              className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-subtle)]"
            />
            {input.trim() && (
              <button
                onClick={() => add(input)}
                className="rounded-lg bg-[var(--accent)] px-2.5 py-0.5 text-[11px] font-semibold text-white"
              >
                OK
              </button>
            )}
          </div>

          {/* Empty */}
          {items.length === 0 && (
            <div className="py-6 text-center text-[12.5px] text-[var(--text-muted)]">
              Liste vide. Tape un article au-dessus pour commencer.
            </div>
          )}

          {/* Groups */}
          {orderedCats.length > 0 && (
            <div className="space-y-3">
              {orderedCats.map((cat) => (
                <div key={cat}>
                  <div className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {cat}
                  </div>
                  <div className="space-y-px">
                    {groups[cat].map((it) => (
                      <div key={it.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-[var(--bg-hover)]">
                        <button
                          onClick={() => toggle(it.id)}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--border-strong)] hover:border-[var(--accent)] active:scale-90"
                          aria-label="Cocher"
                        />
                        <span className="flex-1 text-[14px] text-[var(--text)]">{it.text}</span>
                        <button
                          onClick={() => remove(it.id)}
                          className="invisible text-[var(--text-subtle)] hover:text-rose-600 group-hover:visible"
                          aria-label="Supprimer"
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Done */}
          {done.length > 0 && (
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <div className="mb-1 flex items-center justify-between px-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                <span>Dans le panier · {done.length}</span>
                <button onClick={clearDone} className="font-medium normal-case tracking-normal text-[var(--text-muted)] hover:text-rose-600">
                  Vider
                </button>
              </div>
              <div className="space-y-px opacity-60">
                {done.map((it) => (
                  <div key={it.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1.5">
                    <button
                      onClick={() => toggle(it.id)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white"
                    >
                      <Icon name="check" size={11} />
                    </button>
                    <span className="flex-1 text-[13.5px] text-[var(--text-subtle)] line-through">{it.text}</span>
                    <button onClick={() => remove(it.id)} className="invisible text-[var(--text-subtle)] hover:text-rose-600 group-hover:visible">
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

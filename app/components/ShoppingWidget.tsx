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

// Smart category detection from item name (French food/grocery items)
function detectCategory(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/(pomme|poire|banane|orange|fraise|raisin|salade|tomate|carotte|oignon|courgette|patate|pomme de terre|persil|citron|ail|champignon|cerise|framboise|fruit|legume|legume|épinard|concombre|poivron|aubergine|brocoli|chou|avocat|kiwi|melon|pasteque|peche|abricot|prune|myrtille|fenouil|navet|radis|menthe)/.test(t)) return "🥬 Frais";
  if (/(viande|boeuf|bœuf|poulet|porc|veau|agneau|saucisse|jambon|bacon|lardon|rosbif|cote|filet|escalope|cuisse|coppa|chorizo)/.test(t)) return "🥩 Viande";
  if (/(poisson|saumon|cabillaud|thon|sardine|crevette|moule|huitre|crabe|lotte|truite|bar|merlu|julienne)/.test(t)) return "🐟 Poisson";
  if (/(lait|yaourt|fromage|beurre|crème|creme|fromage blanc|kiri|babybel|comte|chevre|brebis|gruyere|emmental|gruyère|raclette|mozzarella|parmesan|camembert|brie|roquefort|feta)/.test(t)) return "🧀 Crémerie";
  if (/(pain|baguette|brioche|biscotte|tortilla|pita|wrap|croissant|pain au chocolat|chocolatine)/.test(t)) return "🥖 Boulangerie";
  if (/(pâte|pate|riz|farine|sucre|sel|poivre|épice|epice|huile|vinaigre|moutarde|mayonnaise|ketchup|sauce|conserve|haricot|lentille|pois chiche|quinoa|semoule|cereale|cereale|levure|chocolat|miel|confiture|nutella|cafe|café|the|thé)/.test(t)) return "🥫 Épicerie";
  if (/(eau|jus|soda|coca|biere|bière|vin|champagne|whisky|vodka|rhum|sirop|limonade|the glace|the glace|ice tea|jus de fruit|orangina|fanta|sprite|red bull|monster|perrier|badoit)/.test(t)) return "🧃 Boissons";
  if (/(papier|essuie|essuie tout|sopalin|liquide|nettoyant|lessive|adoucissant|javel|eponge|éponge|sac poubelle|bougie|allumette|brique|pile|piles|ampoule|paques|noel|déco|deco)/.test(t)) return "🧽 Maison";
  if (/(savon|shampoing|gel douche|brosse à dent|brosse a dent|dentifrice|deodorant|déodorant|crème|creme|maquillage|cotons|coton tige|coton-tige|hygiene|hygiène|protection|tampon|serviette)/.test(t)) return "🧴 Hygiène";
  return undefined;
}

const QUICK_ADDS = ["Pain", "Lait", "Œufs", "Tomates", "Salade", "Yaourts", "Beurre"];

export default function ShoppingWidget() {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);

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
    const it: Item = {
      id: uid(),
      text: t,
      done: false,
      category: detectCategory(t),
      createdAt: Date.now(),
    };
    update([it, ...items]);
    setInput("");
    haptic("light");
  }

  function toggle(id: string) {
    const next = items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
    update(next);
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

  // Group by category
  const remaining = items.filter((it) => !it.done);
  const done = items.filter((it) => it.done);
  const groups: Record<string, Item[]> = {};
  for (const it of remaining) {
    const c = it.category || "📝 Autre";
    if (!groups[c]) groups[c] = [];
    groups[c].push(it);
  }
  const orderedCats = Object.keys(groups).sort();

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-orange-50 to-amber-50 p-5 dark:from-amber-950/30 dark:to-orange-950/30">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-[18px] shadow-sm">
            🛒
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text)]">Courses</h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              {remaining.length} à acheter{done.length > 0 ? ` · ${done.length} dans le panier` : ""}
            </p>
          </div>
        </div>
        {done.length > 0 && (
          <button
            onClick={clearDone}
            className="rounded-full bg-white/60 px-2.5 py-1 text-[10.5px] font-medium text-[var(--text-muted)] hover:bg-white dark:bg-black/20 dark:hover:bg-black/40"
            title="Vider les articles cochés"
          >
            Vider
          </button>
        )}
      </header>

      {/* Add input */}
      <form
        onSubmit={(e) => { e.preventDefault(); add(input); }}
        className="mb-3 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 backdrop-blur dark:bg-black/30"
      >
        <Icon name="plus" size={14} className="shrink-0 text-orange-600" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ajouter un article…"
          className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-subtle)]"
        />
        {input.trim() && (
          <button type="submit" className="rounded-lg bg-orange-500 px-3 py-1 text-[12px] font-semibold text-white">
            +
          </button>
        )}
      </form>

      {/* Quick suggestions */}
      {items.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {QUICK_ADDS.map((q) => (
            <button
              key={q}
              onClick={() => add(q)}
              className="rounded-full border border-orange-200 bg-white/60 px-3 py-1 text-[12px] text-orange-700 hover:bg-white dark:border-orange-900 dark:bg-black/30 dark:text-orange-300"
            >
              + {q}
            </button>
          ))}
        </div>
      )}

      {/* Items grouped by category */}
      <div className={`space-y-2 ${expanded ? "" : "max-h-[300px] overflow-hidden"}`}>
        {orderedCats.map((cat) => (
          <div key={cat} className="rounded-xl bg-white/50 p-2 backdrop-blur dark:bg-black/20">
            <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {cat}
            </div>
            {groups[cat].map((it) => (
              <div key={it.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/60 dark:hover:bg-black/20">
                <button
                  onClick={() => toggle(it.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-orange-400 bg-white text-orange-600 transition active:scale-90 dark:bg-black/30"
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
        ))}

        {done.length > 0 && (
          <div className="rounded-xl bg-white/40 p-2 backdrop-blur dark:bg-black/10">
            <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              ✓ Dans le panier
            </div>
            {done.map((it) => (
              <div key={it.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 opacity-60">
                <button
                  onClick={() => toggle(it.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white"
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
        )}
      </div>

      {items.length > 6 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-3 w-full rounded-lg bg-white/60 py-2 text-[12px] font-medium text-orange-700 hover:bg-white dark:bg-black/30 dark:text-orange-300"
        >
          Voir tout ({items.length})
        </button>
      )}
      {expanded && items.length > 6 && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-3 w-full rounded-lg bg-white/60 py-2 text-[12px] font-medium text-orange-700 hover:bg-white dark:bg-black/30 dark:text-orange-300"
        >
          Réduire
        </button>
      )}
    </section>
  );
}

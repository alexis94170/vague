"use client";

import { TaskTemplate } from "./types";
import { newId } from "./storage";

const KEY = "vague:templates:v1";

const DEFAULT_TEMPLATES: TaskTemplate[] = [
  {
    id: "tpl-opening",
    name: "Ouverture resto",
    icon: "🌅",
    color: "#f97316",
    order: 0,
    items: [
      { title: "Allumer les lumières et la vitrine", priority: "high" },
      { title: "Vérifier la caisse et la monnaie", priority: "high" },
      { title: "Lancer le lave-vaisselle", priority: "medium" },
      { title: "Préparer la mise en place", priority: "high", estimateMinutes: 45 },
      { title: "Vérifier les livraisons du jour", priority: "medium" },
      { title: "Briefer l'équipe", priority: "high", estimateMinutes: 10 },
    ],
  },
  {
    id: "tpl-closing",
    name: "Fermeture resto",
    icon: "🌙",
    color: "#6366f1",
    order: 1,
    items: [
      { title: "Nettoyer la cuisine", priority: "high", estimateMinutes: 30 },
      { title: "Faire la caisse et clôture Z", priority: "high" },
      { title: "Mettre en place pour demain", priority: "medium", estimateMinutes: 20 },
      { title: "Sortir les poubelles", priority: "medium" },
      { title: "Vérifier réfrigérateurs / congélateurs", priority: "high" },
      { title: "Éteindre et fermer tout", priority: "urgent" },
    ],
  },
  {
    id: "tpl-weekly-admin",
    name: "Admin hebdo",
    icon: "📊",
    color: "#10b981",
    order: 2,
    items: [
      { title: "Vérifier factures fournisseurs reçues", priority: "medium" },
      { title: "Rapprochement bancaire", priority: "high" },
      { title: "Point planning semaine suivante", priority: "high", estimateMinutes: 30 },
      { title: "Inventaire et commandes", priority: "high", estimateMinutes: 60 },
    ],
  },
];

export function loadTemplates(): TaskTemplate[] {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      saveTemplates(DEFAULT_TEMPLATES);
      return DEFAULT_TEMPLATES;
    }
    const list = JSON.parse(raw) as TaskTemplate[];
    return Array.isArray(list) ? list.sort((a, b) => a.order - b.order) : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export function saveTemplates(list: TaskTemplate[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertTemplate(t: TaskTemplate) {
  const list = loadTemplates();
  const idx = list.findIndex((x) => x.id === t.id);
  if (idx >= 0) list[idx] = t;
  else list.push({ ...t, order: list.length });
  saveTemplates(list);
}

export function deleteTemplate(id: string) {
  const list = loadTemplates().filter((t) => t.id !== id);
  saveTemplates(list);
}

export function createEmptyTemplate(): TaskTemplate {
  return {
    id: newId(),
    name: "Nouveau modèle",
    icon: "✨",
    color: "#6366f1",
    order: loadTemplates().length,
    items: [],
  };
}

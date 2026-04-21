import { Priority, Project, Recurrence } from "./types";
import { addDays, todayISO, toISODate, parseISODate } from "./dates";

export type ParsedInput = {
  title: string;
  projectId?: string;
  projectName?: string;
  tags: string[];
  priority?: Priority;
  dueDate?: string;
  dueTime?: string;
  estimateMinutes?: number;
  recurrence?: Recurrence;
  tokens: Token[];
};

export type Token = {
  kind: "project" | "tag" | "priority" | "date" | "time" | "estimate" | "recurrence";
  raw: string;
  label: string;
};

const PRIORITY_ALIASES: Record<string, Priority> = {
  "1": "urgent", urgent: "urgent", u: "urgent",
  "2": "high", haute: "high", haut: "high", h: "high",
  "3": "medium", moyenne: "medium", moyen: "medium", m: "medium", med: "medium",
  "4": "low", basse: "low", bas: "low", b: "low", l: "low",
  "5": "none", aucune: "none",
};

const WEEKDAYS: Record<string, number> = {
  dim: 0, dimanche: 0,
  lun: 1, lundi: 1,
  mar: 2, mardi: 2,
  mer: 3, mercredi: 3,
  jeu: 4, jeudi: 4,
  ven: 5, vendredi: 5,
  sam: 6, samedi: 6,
};

function parseTime(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})[h:](\d{0,2})$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseRelativeDate(word: string): string | null {
  const today = todayISO();
  const w = word.toLowerCase();
  if (w === "aujourd'hui" || w === "auj" || w === "today") return today;
  if (w === "demain" || w === "tomorrow") return addDays(today, 1);
  if (w === "apdemain" || w === "ap-demain") return addDays(today, 2);
  if (w === "hier") return addDays(today, -1);
  if (w === "semaine" || w === "sem") return addDays(today, 7);
  if (w === "mois") return addDays(today, 30);
  const weekday = WEEKDAYS[w];
  if (weekday !== undefined) {
    const now = parseISODate(today).getDay();
    let offset = weekday - now;
    if (offset <= 0) offset += 7;
    return addDays(today, offset);
  }
  return null;
}

function parseAbsoluteDate(word: string): string | null {
  let m = word.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    let y = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    if (d > 31 || mo > 11 || mo < 0) return null;
    const date = new Date(y, mo, d);
    if (date.getDate() !== d) return null;
    return toISODate(date);
  }
  m = word.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return word;
  return null;
}

function parseEstimate(raw: string): number | null {
  const m = raw.match(/^(\d+(?:[.,]\d+)?)(min|m|h|j)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  const unit = (m[2] || "min").toLowerCase();
  if (unit === "min" || unit === "m") return Math.round(n);
  if (unit === "h") return Math.round(n * 60);
  if (unit === "j") return Math.round(n * 60 * 8);
  return null;
}

function parseRecurrence(raw: string): Recurrence | null {
  const w = raw.toLowerCase();
  if (w === "jour" || w === "quotidien") return { unit: "day", interval: 1 };
  if (w === "sem" || w === "semaine" || w === "hebdo") return { unit: "week", interval: 1 };
  if (w === "mois" || w === "mensuel") return { unit: "month", interval: 1 };
  if (w === "an" || w === "annee" || w === "annuel") return { unit: "year", interval: 1 };
  let m = w.match(/^(\d+)(j|s|m|a)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const u = m[2];
    if (u === "j") return { unit: "day", interval: n };
    if (u === "s") return { unit: "week", interval: n };
    if (u === "m") return { unit: "month", interval: n };
    if (u === "a") return { unit: "year", interval: n };
  }
  const days = w.match(/^[lmjvsd]+$/i);
  if (days && w.length <= 7) {
    const map: Record<string, number> = { d: 0, l: 1, ma: 2, me: 3, j: 4, v: 5, s: 6 };
    const result: number[] = [];
    let i = 0;
    while (i < w.length) {
      const two = w.slice(i, i + 2);
      const one = w.slice(i, i + 1);
      if (map[two] !== undefined) { result.push(map[two]); i += 2; }
      else if (map[one] !== undefined) { result.push(map[one]); i += 1; }
      else return null;
    }
    if (result.length > 0) return { unit: "week", interval: 1, daysOfWeek: result };
  }
  return null;
}

export function parseInput(input: string, projects: Project[]): ParsedInput {
  const result: ParsedInput = { title: "", tags: [], tokens: [] };
  const words = input.split(/\s+/);
  const remaining: string[] = [];

  for (const word of words) {
    if (!word) continue;

    if (word.startsWith("#") && word.length > 1) {
      const name = word.slice(1).toLowerCase();
      const proj = projects.find((p) => p.name.toLowerCase().startsWith(name));
      if (proj) {
        result.projectId = proj.id;
        result.projectName = proj.name;
        result.tokens.push({ kind: "project", raw: word, label: proj.name });
      } else {
        result.projectName = word.slice(1);
        result.tokens.push({ kind: "project", raw: word, label: `+ ${word.slice(1)}` });
      }
      continue;
    }

    if (word.startsWith("@") && word.length > 1) {
      const tag = word.slice(1);
      if (!result.tags.includes(tag)) result.tags.push(tag);
      result.tokens.push({ kind: "tag", raw: word, label: `@${tag}` });
      continue;
    }

    if (word.startsWith("!") && word.length > 1) {
      const key = word.slice(1).toLowerCase();
      const p = PRIORITY_ALIASES[key];
      if (p) {
        result.priority = p;
        result.tokens.push({ kind: "priority", raw: word, label: `P: ${p}` });
        continue;
      }
    }

    if (word.startsWith("~") && word.length > 1) {
      const est = parseEstimate(word.slice(1));
      if (est !== null) {
        result.estimateMinutes = est;
        result.tokens.push({ kind: "estimate", raw: word, label: `~${est}min` });
        continue;
      }
    }

    if (word.startsWith("*") && word.length > 1) {
      const rec = parseRecurrence(word.slice(1));
      if (rec) {
        result.recurrence = rec;
        result.tokens.push({ kind: "recurrence", raw: word, label: `↻ ${rec.unit}` });
        continue;
      }
    }

    const time = parseTime(word);
    if (time) {
      result.dueTime = time;
      if (!result.dueDate) result.dueDate = todayISO();
      result.tokens.push({ kind: "time", raw: word, label: time });
      continue;
    }

    const rel = parseRelativeDate(word);
    if (rel) {
      result.dueDate = rel;
      result.tokens.push({ kind: "date", raw: word, label: word });
      continue;
    }
    const abs = parseAbsoluteDate(word);
    if (abs) {
      result.dueDate = abs;
      result.tokens.push({ kind: "date", raw: word, label: word });
      continue;
    }

    remaining.push(word);
  }

  result.title = remaining.join(" ").trim();
  return result;
}

export function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toISODate(d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addWeeks(iso: string, n: number): string {
  return addDays(iso, n * 7);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
}

export function addYears(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setFullYear(d.getFullYear() + n);
  return toISODate(d);
}

export function diffDays(iso: string, fromISO: string = todayISO()): number {
  const a = parseISODate(iso).getTime();
  const b = parseISODate(fromISO).getTime();
  return Math.round((a - b) / 86400000);
}

export function formatDueLabel(iso?: string): { label: string; tone: string } | null {
  if (!iso) return null;
  const diff = diffDays(iso);
  let label: string;
  if (diff === 0) label = "Aujourd'hui";
  else if (diff === 1) label = "Demain";
  else if (diff === -1) label = "Hier";
  else if (diff < 0) label = `Retard ${-diff} j`;
  else if (diff < 7) label = weekdayName(iso);
  else label = formatShort(iso);
  const tone =
    diff < 0
      ? "text-rose-500"
      : diff === 0
        ? "text-amber-500"
        : diff <= 3
          ? "text-zinc-600 dark:text-zinc-300"
          : "text-zinc-500 dark:text-zinc-400";
  return { label, tone };
}

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const WEEKDAYS_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function weekdayName(iso: string): string {
  return WEEKDAYS[parseISODate(iso).getDay()];
}

export function formatShort(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatFull(iso: string): string {
  const d = parseISODate(iso);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function startOfWeekISO(iso: string = todayISO()): string {
  const d = parseISODate(iso);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(iso, offset);
}

export function endOfWeekISO(iso: string = todayISO()): string {
  return addDays(startOfWeekISO(iso), 6);
}

import { Recurrence } from "./types";
import { addDays, addMonths, addWeeks, addYears, parseISODate, toISODate } from "./dates";

export function nextOccurrence(fromISO: string, rec: Recurrence): string {
  const n = Math.max(1, rec.interval);
  if (rec.unit === "day") return addDays(fromISO, n);
  if (rec.unit === "week") {
    if (rec.daysOfWeek && rec.daysOfWeek.length > 0) {
      const start = parseISODate(fromISO);
      for (let i = 1; i <= 7 * n; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        if (rec.daysOfWeek.includes(d.getDay())) return toISODate(d);
      }
    }
    return addWeeks(fromISO, n);
  }
  if (rec.unit === "month") return addMonths(fromISO, n);
  return addYears(fromISO, n);
}

export function formatRecurrence(rec: Recurrence): string {
  const n = rec.interval;
  if (rec.unit === "day") return n === 1 ? "Chaque jour" : `Tous les ${n} jours`;
  if (rec.unit === "week") {
    if (rec.daysOfWeek && rec.daysOfWeek.length > 0) {
      const names = ["D", "L", "M", "M", "J", "V", "S"];
      return `Hebdo (${rec.daysOfWeek.sort().map((d) => names[d]).join("")})`;
    }
    return n === 1 ? "Chaque semaine" : `Toutes les ${n} semaines`;
  }
  if (rec.unit === "month") return n === 1 ? "Chaque mois" : `Tous les ${n} mois`;
  return n === 1 ? "Chaque année" : `Tous les ${n} ans`;
}

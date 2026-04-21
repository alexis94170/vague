import { Priority, Project, Task } from "./types";
import { newId } from "./storage";

export type XlsxSheet = {
  name: string;
  rows: Array<Record<string, unknown>>;
  detected: {
    title?: string;
    priority?: string;
    category?: string;
    notes?: string;
    status?: string;
    dueDate?: string;
  };
};

export type XlsxPreview = {
  sheets: XlsxSheet[];
};

const HEADER_HINTS: Record<keyof XlsxSheet["detected"], string[]> = {
  title: ["tâche", "tache", "titre", "title", "task", "nom", "description"],
  priority: ["priorité", "priorite", "priority", "prio", "importance"],
  category: ["catégorie", "categorie", "category", "type", "tag", "étiquette", "etiquette"],
  notes: ["notes", "note", "commentaire", "comments", "remarque", "détails", "details"],
  status: ["statut", "status", "état", "etat", "state"],
  dueDate: ["échéance", "echeance", "date", "due", "deadline", "dueDate", "dû", "du"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectColumns(headers: string[]): XlsxSheet["detected"] {
  const result: XlsxSheet["detected"] = {};
  const norm = headers.map(normalize);
  for (const [key, hints] of Object.entries(HEADER_HINTS) as Array<
    [keyof XlsxSheet["detected"], string[]]
  >) {
    for (const hint of hints) {
      const idx = norm.findIndex((h) => h === hint || h.includes(hint));
      if (idx >= 0) {
        result[key] = headers[idx];
        break;
      }
    }
  }
  return result;
}

export async function readXlsxFile(file: File): Promise<XlsxPreview> {
  const XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets: XlsxSheet[] = wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { name, rows, detected: detectColumns(headers) };
  });
  return { sheets };
}

function mapPriority(raw: unknown): Priority {
  if (raw === null || raw === undefined || raw === "") return "none";
  const s = String(raw).toLowerCase().trim();
  const n = Number(s);
  if (!Number.isNaN(n)) {
    if (n >= 10) return "urgent";
    if (n >= 8) return "high";
    if (n >= 5) return "medium";
    if (n >= 2) return "low";
    return "none";
  }
  if (s.includes("urg")) return "urgent";
  if (s.includes("haut") || s === "high" || s === "h") return "high";
  if (s.includes("moy") || s === "medium" || s === "m") return "medium";
  if (s.includes("bas") || s === "low" || s === "l") return "low";
  return "none";
}

function slugTag(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseDate(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return undefined;
}

function isDone(raw: unknown): boolean {
  if (!raw) return false;
  const s = String(raw).toLowerCase();
  if (s.includes("à faire") || s.includes("a faire")) return false;
  if (s.includes("fait")) return true;
  if (s.includes("done") || s.includes("complete") || s.includes("terminé")) return true;
  return false;
}

const PALETTE = [
  "#f97316", "#10b981", "#6366f1", "#ec4899", "#06b6d4",
  "#8b5cf6", "#eab308", "#ef4444", "#14b8a6", "#a855f7",
];

export function buildImport(preview: XlsxPreview): {
  projects: Project[];
  tasks: Task[];
} {
  const projects: Project[] = [];
  const tasks: Task[] = [];
  const now = new Date().toISOString();

  preview.sheets.forEach((s, i) => {
    const d = s.detected;
    if (!d.title) return;
    const projectId = newId();
    projects.push({
      id: projectId,
      name: s.name,
      color: PALETTE[i % PALETTE.length],
      order: i,
    });

    s.rows.forEach((row, ri) => {
      const title = String(row[d.title!] ?? "").trim();
      if (!title) return;
      const tags: string[] = [];
      if (d.category) {
        const cat = String(row[d.category] ?? "").trim();
        if (cat) tags.push(slugTag(cat));
      }
      const priority = d.priority ? mapPriority(row[d.priority]) : "none";
      const notes = d.notes ? String(row[d.notes] ?? "").trim() : "";
      const done = d.status ? isDone(row[d.status]) : false;
      const dueDate = d.dueDate ? parseDate(row[d.dueDate]) : undefined;

      tasks.push({
        id: newId(),
        title,
        notes: notes || undefined,
        done,
        doneAt: done ? now : undefined,
        priority,
        projectId,
        tags,
        dueDate,
        subtasks: [],
        createdAt: now,
        order: ri,
      });
    });
  });

  return { projects, tasks };
}

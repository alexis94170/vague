const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");

const INPUT = process.argv[2] || "C:/Users/alexi/Downloads/toutes-taches.xlsx";
const OUTPUT = process.argv[3] || "C:/Users/alexi/Downloads/vague-backup.json";

const PROJECT_COLORS = {
  "Indiana Café": "#f97316",
  "Immobilier": "#10b981",
  "Pro": "#6366f1",
  "Perso": "#ec4899",
};

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function mapPriority(n) {
  const v = Number(n);
  if (v >= 10) return "urgent";
  if (v >= 8) return "high";
  if (v >= 5) return "medium";
  if (v >= 2) return "low";
  return "none";
}

function slugTag(s) {
  return s.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function cleanProjectName(name) {
  return name.replace(/^\p{Emoji_Presentation}\s*|^\p{Extended_Pictographic}\s*/u, "").trim();
}

function getEmoji(name) {
  const m = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return m ? m[1] : "";
}

const wb = xlsx.readFile(INPUT);
const projects = [
  { id: "inbox", name: "Boîte de réception", color: "#64748b", order: 0 },
];
const tasks = [];
const now = new Date().toISOString();

wb.SheetNames.forEach((sheetName, pi) => {
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const display = sheetName;
  const cleanName = cleanProjectName(sheetName);
  const color = PROJECT_COLORS[cleanName] || "#6366f1";
  const projectId = newId();
  projects.push({
    id: projectId,
    name: display,
    color,
    order: pi + 1,
  });

  rows.slice(1).forEach((r, ri) => {
    const [, title, priority, category, notes, statut] = r;
    if (!title || typeof title !== "string") return;
    const tags = [];
    if (category && String(category).trim()) {
      tags.push(slugTag(String(category)));
    }
    const done = String(statut || "").toLowerCase().includes("fait") &&
                 !String(statut || "").toLowerCase().includes("à faire");
    tasks.push({
      id: newId(),
      title: title.trim(),
      notes: notes && String(notes).trim() ? String(notes).trim() : undefined,
      done,
      doneAt: done ? now : undefined,
      priority: mapPriority(priority),
      projectId,
      tags,
      dueDate: undefined,
      subtasks: [],
      createdAt: now,
      order: ri,
    });
  });
});

const state = {
  version: 2,
  tasks,
  projects,
  settings: { theme: "system" },
};

fs.writeFileSync(OUTPUT, JSON.stringify(state, null, 2), "utf8");

console.log(`✓ ${tasks.length} tâches → ${OUTPUT}`);
console.log(`  Projets (${projects.length - 1}):`);
projects.slice(1).forEach((p) => {
  const count = tasks.filter((t) => t.projectId === p.id).length;
  console.log(`    ${p.name}: ${count} tâches`);
});
const byPrio = {};
tasks.forEach((t) => { byPrio[t.priority] = (byPrio[t.priority] || 0) + 1; });
console.log("  Priorités:", byPrio);

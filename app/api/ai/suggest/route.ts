import { anthropic, CHAT_MODEL, handleAnthropicError, hasApiKey } from "../../../lib/ai-shared";
import { checkDailyBudget, checkRateLimit, estimateCost, recordSpend } from "../../../lib/ai-ratelimit";

export const runtime = "nodejs";

type TaskBrief = {
  id: string;
  title: string;
  priority: string;
  projectName?: string;
  dueDate?: string;
  waiting?: boolean;
  waitingFor?: string;
  tags?: string[];
  createdAt?: string;
  estimateMinutes?: number;
  snoozeCount?: number;
};

type EventDayBrief = {
  date: string; // YYYY-MM-DD
  events: number;
  totalMinutes: number;
  freeMinutes: number;
};

type SuggestInput = {
  tasks: TaskBrief[];
  today: string;
  weekAgenda?: EventDayBrief[];
};

const SUGGEST_TOOL = {
  name: "emit_suggestions",
  description: "Propose 3 à 6 suggestions concrètes et actionnables pour l'utilisateur, basées sur l'analyse approfondie de ses tâches et de son agenda.",
  input_schema: {
    type: "object" as const,
    properties: {
      headline: {
        type: "string",
        description: "Résumé très court de l'état des lieux (une seule phrase, <80 caractères). Ex: '3 urgences cette semaine, jeudi est ton jour le plus libre.'",
      },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["focus", "reschedule", "followup", "cleanup", "waiting", "insight", "workload", "snoozed"],
              description: "focus=à traiter d'abord · reschedule=reporter · followup=relancer une attente · cleanup=trop vieux, archiver · waiting=vérifier attente · insight=observation · workload=alerte charge · snoozed=tâche reportée plusieurs fois",
            },
            title: {
              type: "string",
              description: "Suggestion courte et SPÉCIFIQUE, 8-20 mots. Cite des noms de tâches ou de projets si pertinent.",
            },
            detail: {
              type: "string",
              description: "Détail / pourquoi (1 phrase max, ~15 mots). Optionnel.",
            },
            taskIds: {
              type: "array",
              items: { type: "string" },
              description: "IDs des tâches concernées (de 1 à 5 max)",
            },
            action: {
              type: "string",
              enum: ["mark_today", "snooze_tomorrow", "snooze_week", "mark_waiting", "delete", "none"],
              description: "Action que l'utilisateur peut appliquer en 1 clic.",
            },
          },
          required: ["kind", "title", "taskIds", "action"],
          additionalProperties: false,
        },
      },
    },
    required: ["headline", "suggestions"],
    additionalProperties: false,
  },
};

export async function POST(req: Request) {
  if (!hasApiKey()) {
    return Response.json({ error: "ANTHROPIC_API_KEY non configurée." }, { status: 501 });
  }
  const rl = checkRateLimit("suggest", req.headers);
  if (!rl.ok) {
    return Response.json({ error: `Trop de requêtes. Réessaie dans ${Math.ceil(rl.retryAfter / 60)} minutes.` }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  const budget = checkDailyBudget(req.headers);
  if (!budget.ok) {
    return Response.json({ error: `Budget IA quotidien atteint (${budget.current.toFixed(3)}$). Reset à minuit UTC.` }, { status: 429 });
  }
  let body: SuggestInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalide" }, { status: 400 });
  }
  if (!Array.isArray(body.tasks)) {
    return Response.json({ error: "tasks requis" }, { status: 400 });
  }

  const systemBlocks = [
    {
      type: "text" as const,
      text: `Tu es un coach de productivité expert qui analyse la situation d'un entrepreneur et propose 3-6 actions ciblées et concrètes.

PATTERNS À DÉTECTER (par ordre d'importance) :

1. **TÂCHES REPORTÉES PLUSIEURS FOIS** (kind: "snoozed")
   - Si une tâche a snoozeCount >= 3, demander si elle est vraiment voulue ou à supprimer.

2. **SURCHARGE / SOUS-CHARGE** (kind: "workload")
   - Compare la charge totale (somme des estimateMinutes des tâches dues d'ici 7j) au temps libre dans l'agenda.
   - Si surcharge >120% : suggérer reporter X tâches.
   - Si une journée est beaucoup plus libre qu'une autre : "Place tes urgences mardi, tu as 4h libres".

3. **TÂCHES URGENTES EN RETARD / DUES AUJOURD'HUI** (kind: "focus")
   - Si > 3 urgences, prioriser concrètement.

4. **TÂCHES EN ATTENTE OUBLIÉES** (kind: "followup")
   - waiting + créée il y a >5j → relancer.

5. **TÂCHES STALES** (kind: "cleanup")
   - priorité "low" et créée il y a >30j → archiver.

6. **TÂCHES SANS DATE QUI DEVRAIENT EN AVOIR** (kind: "reschedule")
   - Priorité high/urgent et pas de dueDate.

7. **CLUSTERING PAR PROJET** (kind: "insight")
   - Si 5+ tâches d'un même projet stagnent → "Bloque une matinée pour Indiana Café".

8. **OBSERVATIONS INTÉRESSANTES** (kind: "insight")
   - Tendance positive ("3e jour de suite avec >5 tâches faites !"), motivation.

RÈGLES DE FORMULATION :
- TUTOIE.
- SPÉCIFIQUE : cite les noms de tâches/projets ("Tu as reporté 'appeler banquier' 4 fois")
- ACTIONNABLE : chaque suggestion a une action 1-clic claire.
- HONNÊTE : si rien ne cloche, headline positif + 0-2 suggestions max.
- 6 suggestions MAX, 3-4 idéal.
- Pas de blabla, va à l'essentiel.

Toujours appeler emit_suggestions.`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const taskLines = body.tasks.slice(0, 200).map((t) => {
    const bits: string[] = [`[${t.id}]`, `« ${t.title} »`, `prio=${t.priority}`];
    if (t.projectName) bits.push(`projet=${t.projectName}`);
    if (t.dueDate) bits.push(`échéance=${t.dueDate}`);
    if (t.estimateMinutes) bits.push(`~${t.estimateMinutes}min`);
    if (t.waiting) bits.push(t.waitingFor ? `ATTENTE(${t.waitingFor})` : "ATTENTE");
    if (t.createdAt) {
      const days = Math.round((Date.now() - new Date(t.createdAt).getTime()) / 86_400_000);
      bits.push(`créée il y a ${days}j`);
    }
    if (t.snoozeCount && t.snoozeCount >= 2) bits.push(`REPORTÉE ${t.snoozeCount}x`);
    if (t.tags && t.tags.length > 0) bits.push(`tags=${t.tags.join(",")}`);
    return bits.join(" · ");
  }).join("\n");

  const agendaLines = (body.weekAgenda ?? [])
    .map((d) => `- ${d.date} : ${d.events} event${d.events > 1 ? "s" : ""} (${d.totalMinutes}min occupé · ${d.freeMinutes}min libre)`)
    .join("\n");

  const userMessage = `Date : ${body.today}

${agendaLines ? `=== AGENDA SEMAINE ===
${agendaLines}

` : ""}=== TÂCHES ACTIVES (${body.tasks.length}) ===
${taskLines || "(aucune tâche active)"}

Analyse et propose des suggestions concrètes et personnalisées.`;

  try {
    const response = await anthropic().messages.create({
      model: CHAT_MODEL,
      max_tokens: 2048,
      system: systemBlocks,
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "emit_suggestions" },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({ error: "Réponse IA invalide" }, { status: 502 });
    }
    const out = toolUse.input as {
      headline: string;
      suggestions: Array<{ kind: string; title: string; detail?: string; taskIds: string[]; action: string }>;
    };
    const validIds = new Set(body.tasks.map((t) => t.id));
    out.suggestions = out.suggestions
      .map((s) => ({ ...s, taskIds: s.taskIds.filter((id) => validIds.has(id)) }))
      .filter((s) => s.taskIds.length > 0 || s.action === "none");

    const usage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    };
    const cost = estimateCost(CHAT_MODEL, usage);
    recordSpend(req.headers, cost);
    return Response.json({ ...out, usage: { ...usage, cost } });
  } catch (err) {
    return handleAnthropicError(err);
  }
}

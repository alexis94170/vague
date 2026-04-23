import { anthropic, CHAT_MODEL, handleAnthropicError, hasApiKey } from "../../../lib/ai-shared";

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
};

type SuggestInput = {
  tasks: TaskBrief[];
  today: string;
};

const SUGGEST_TOOL = {
  name: "emit_suggestions",
  description: "Propose 3 à 5 suggestions concrètes et actionables pour l'utilisateur, basées sur l'analyse de ses tâches.",
  input_schema: {
    type: "object" as const,
    properties: {
      headline: {
        type: "string",
        description: "Résumé très court de l'état des lieux (une seule phrase, <80 caractères)",
      },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["focus", "reschedule", "followup", "cleanup", "waiting", "insight"],
              description: "focus=à traiter d'abord · reschedule=reporter · followup=relancer une attente · cleanup=trop vieux, archiver · waiting=vérifier attente · insight=observation",
            },
            title: {
              type: "string",
              description: "Suggestion courte et actionable, 8-15 mots",
            },
            taskIds: {
              type: "array",
              items: { type: "string" },
              description: "IDs des tâches concernées (de 1 à 5 max)",
            },
            action: {
              type: "string",
              enum: ["mark_today", "snooze_tomorrow", "snooze_week", "mark_waiting", "delete", "none"],
              description: "Action que l'utilisateur peut appliquer en 1 clic. 'none' si juste informatif.",
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
      text: `Tu es un coach de productivité qui analyse la liste de tâches d'un utilisateur et propose 3-5 actions concrètes.

Tu dois identifier :
- Tâches URGENTES en retard ou dues aujourd'hui → suggestion "focus" pour les traiter en priorité
- Tâches en attente depuis plus de 5 jours → suggestion "followup" pour relancer
- Tâches "basse priorité" créées il y a >30 jours → suggestion "cleanup" pour nettoyer
- Tâches sans date avec priorité "high"/"urgent" → suggestion "reschedule" pour leur donner une date
- Observations intéressantes (ex: un projet bloque beaucoup) → "insight"

Règles :
- Maximum 5 suggestions, idéalement 3-4.
- Des phrases courtes, tutoyer ("Tu as 4…", "Pense à…")
- Être concret et spécifique, pas générique.
- Si rien ne mérite d'être signalé, renvoie headline positif + 0 suggestion.
- Toujours appeler emit_suggestions.`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const taskLines = body.tasks.slice(0, 200).map((t) => {
    const bits: string[] = [`[${t.id}]`, `« ${t.title} »`, `prio=${t.priority}`];
    if (t.projectName) bits.push(`projet=${t.projectName}`);
    if (t.dueDate) bits.push(`échéance=${t.dueDate}`);
    if (t.waiting) bits.push(t.waitingFor ? `ATTENTE(${t.waitingFor})` : "ATTENTE");
    if (t.createdAt) bits.push(`créée=${t.createdAt.slice(0, 10)}`);
    if (t.tags && t.tags.length > 0) bits.push(`tags=${t.tags.join(",")}`);
    return bits.join(" · ");
  }).join("\n");

  const userMessage = `Date : ${body.today}

Mes tâches actives (${body.tasks.length}) :
${taskLines}

Analyse et propose 3-5 suggestions actionables pour m'aider à avancer.`;

  try {
    const response = await anthropic().messages.create({
      model: CHAT_MODEL,
      max_tokens: 1600,
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
      suggestions: Array<{ kind: string; title: string; taskIds: string[]; action: string }>;
    };
    // Filter valid taskIds
    const validIds = new Set(body.tasks.map((t) => t.id));
    out.suggestions = out.suggestions
      .map((s) => ({ ...s, taskIds: s.taskIds.filter((id) => validIds.has(id)) }))
      .filter((s) => s.taskIds.length > 0 || s.action === "none");

    return Response.json(out);
  } catch (err) {
    return handleAnthropicError(err);
  }
}

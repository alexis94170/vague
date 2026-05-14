import { anthropic, REASONING_MODEL, handleAnthropicError, hasApiKey } from "../../../lib/ai-shared";
import { checkDailyBudget, checkRateLimit, estimateCost, recordSpend } from "../../../lib/ai-ratelimit";

export const runtime = "nodejs";

type TaskBrief = {
  id: string;
  title: string;
  priority: string;
  projectName?: string;
  dueDate?: string;
  overdue?: boolean;
  estimateMinutes?: number;
  tags?: string[];
};

type EventBrief = {
  summary: string;
  start: string; // HH:MM
  end: string; // HH:MM
  calendar?: string;
};

type FreeSlotBrief = {
  start: string; // HH:MM
  end: string;
  minutes: number;
};

type PlanInput = {
  tasks: TaskBrief[];
  today: string;
  availableMinutes?: number;
  focus?: string;
  events?: EventBrief[];
  freeSlots?: FreeSlotBrief[];
  workWindow?: { start: string; end: string };
  profile?: string; // optional user profile block (built client-side)
};

const PLAN_TOOL = {
  name: "propose_daily_plan",
  description: "Sélectionne 5-7 tâches pour aujourd'hui ET propose un horaire précis pour chacune dans les créneaux libres de l'agenda.",
  input_schema: {
    type: "object" as const,
    properties: {
      schedule: {
        type: "array",
        description: "Liste ordonnée des tâches à faire aujourd'hui avec horaires proposés. 5-7 tâches sauf si la liste candidate est plus courte.",
        items: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "ID exact de la tâche" },
            suggestedTime: {
              type: "string",
              description: "Heure de début proposée au format HH:MM. Doit tomber dans un créneau libre. Si aucun créneau ne convient, mettre une chaîne vide."
            },
            durationMinutes: {
              type: "number",
              description: "Durée prévue en minutes (utilise estimateMinutes si fourni, sinon estime raisonnablement entre 15 et 90 min)"
            },
            reasoning: {
              type: "string",
              description: "Raison brève (1 phrase max, ~12 mots) du placement de CETTE tâche à CETTE heure : énergie, contexte, urgence, ordre logique."
            },
          },
          required: ["taskId", "suggestedTime", "durationMinutes", "reasoning"],
          additionalProperties: false,
        },
      },
      reasoning: {
        type: "string",
        description: "Vue d'ensemble de la stratégie du jour (3-4 phrases) : quelles priorités traitées, quelle logique de placement, équilibre entre projets, conseils.",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Avertissements (charge excessive, conflits, urgences à reporter…). Tableau vide si rien à signaler.",
      },
    },
    required: ["schedule", "reasoning", "warnings"],
    additionalProperties: false,
  },
};

export async function POST(req: Request) {
  if (!hasApiKey()) {
    return Response.json({ error: "ANTHROPIC_API_KEY non configurée côté serveur." }, { status: 501 });
  }
  const rl = checkRateLimit("plan", req.headers);
  if (!rl.ok) {
    return Response.json({ error: `Trop de requêtes. Réessaie dans ${Math.ceil(rl.retryAfter / 60)} minutes.` }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  const budget = checkDailyBudget(req.headers);
  if (!budget.ok) {
    return Response.json({ error: `Budget IA quotidien atteint (${budget.current.toFixed(3)}$). Reset à minuit UTC.` }, { status: 429 });
  }

  let body: PlanInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalide" }, { status: 400 });
  }
  if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
    return Response.json({ error: "tasks requis" }, { status: 400 });
  }

  const hasCalendar = (body.events && body.events.length > 0) || (body.freeSlots && body.freeSlots.length > 0);

  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [];

  if (body.profile && body.profile.trim()) {
    systemBlocks.push({
      type: "text",
      text: body.profile,
      cache_control: { type: "ephemeral" },
    });
  }

  systemBlocks.push({
      type: "text" as const,
      text: `Tu es un coach de productivité expert qui planifie la journée d'un entrepreneur. Tu n'agis que via l'outil propose_daily_plan.

PRIORITÉS (dans l'ordre) :
1. Tâches en RETARD urgentes/hautes
2. Tâches dues aujourd'hui
3. Urgentes/hautes non-datées
4. Tâches qui débloquent d'autres choses

PLACEMENT INTELLIGENT (essentiel quand un agenda est fourni) :
- Tâches cognitives lourdes (compta, stratégie, écriture) → matin, début de créneau
- Tâches admin/répétitives → après-midi
- Appels/relances → milieu de journée
- Évite ABSOLUMENT de placer une tâche pendant un événement existant — utilise UNIQUEMENT les créneaux libres
- Laisse 5-10 min de buffer entre les tâches
- Respecte les estimateMinutes — si une tâche est 90min, elle doit tenir dans un créneau de >=90min
- Si pas assez de créneaux, choisis moins de tâches (3-4 plutôt que 7) et explique pourquoi

ÉQUILIBRE :
- Ne mets pas tout du même projet
- Mix tâches courtes et longues si possible
- Une tâche urgente ne doit pas attendre l'après-midi

WARNINGS À ÉMETTRE :
- Plus de 4h de tâches estimées → surcharge
- Plus de 3 urgences en retard → reporter certaines
- Tâche placée hors créneau libre faute d'alternative → signaler
- Tâche sans heure trouvée → préciser pourquoi

ADAPTATION AU PROFIL UTILISATEUR :
- Si tu vois des préférences ou habitudes spécifiques dans le profil ci-dessus, RESPECTE-LES strictement.
- Si l'utilisateur dit "jamais de cognitif après 18h", n'en place pas le soir.
- Si l'utilisateur a une routine ("mardi soir : compta"), respecte-la quand possible.`,
      cache_control: { type: "ephemeral" as const },
    });

  const taskLines = body.tasks
    .map((t) => {
      const bits = [`[${t.id}]`];
      bits.push(`« ${t.title} »`);
      bits.push(`prio=${t.priority}`);
      if (t.projectName) bits.push(`projet=${t.projectName}`);
      if (t.dueDate) bits.push(`échéance=${t.dueDate}${t.overdue ? " (RETARD)" : ""}`);
      if (t.estimateMinutes) bits.push(`~${t.estimateMinutes}min`);
      if (t.tags && t.tags.length > 0) bits.push(`tags=${t.tags.join(",")}`);
      return bits.join(" · ");
    })
    .join("\n");

  const eventLines = (body.events ?? [])
    .map((e) => `- ${e.start}-${e.end} : ${e.summary}${e.calendar ? ` [${e.calendar}]` : ""}`)
    .join("\n");

  const slotLines = (body.freeSlots ?? [])
    .map((s) => `- ${s.start} → ${s.end} (${s.minutes} min)`)
    .join("\n");

  const userMessage = `Aujourd'hui : ${body.today}
${body.workWindow ? `Fenêtre de travail : ${body.workWindow.start} - ${body.workWindow.end}\n` : ""}${body.availableMinutes ? `Temps dispo estimé : ${body.availableMinutes} min\n` : ""}${body.focus ? `Focus particulier : ${body.focus}\n` : ""}
${hasCalendar ? `=== AGENDA D'AUJOURD'HUI ===
${eventLines || "(aucun événement)"}

=== CRÉNEAUX LIBRES ===
${slotLines || "(aucun créneau libre — agenda plein)"}

` : `(Pas d'agenda Google connecté — propose des horaires entre 8h et 19h sans contrainte d'événements existants.)\n\n`}
=== TÂCHES CANDIDATES (${body.tasks.length}) ===
${taskLines}

Propose ton plan via propose_daily_plan.`;

  try {
    const response = await anthropic().messages.create({
      model: REASONING_MODEL,
      max_tokens: 6144,
      system: systemBlocks,
      tools: [PLAN_TOOL],
      tool_choice: { type: "tool", name: "propose_daily_plan" },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({ error: "Réponse IA invalide" }, { status: 502 });
    }
    const out = toolUse.input as {
      schedule: Array<{
        taskId: string;
        suggestedTime: string;
        durationMinutes: number;
        reasoning: string;
      }>;
      reasoning: string;
      warnings: string[];
    };
    // Filter to only valid IDs
    const validIds = new Set(body.tasks.map((t) => t.id));
    out.schedule = out.schedule.filter((s) => validIds.has(s.taskId));

    // For backwards compatibility with old client, also return selectedIds
    const selectedIds = out.schedule.map((s) => s.taskId);

    const usage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    };
    const cost = estimateCost(REASONING_MODEL, usage);
    recordSpend(req.headers, cost);
    return Response.json({
      schedule: out.schedule,
      selectedIds, // legacy
      reasoning: out.reasoning,
      warnings: out.warnings,
      usage: { ...usage, cost },
    });
  } catch (err) {
    return handleAnthropicError(err);
  }
}

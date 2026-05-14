import { anthropic, CHAT_MODEL, handleAnthropicError, hasApiKey } from "../../../lib/ai-shared";
import { checkDailyBudget, checkRateLimit, estimateCost, recordSpend } from "../../../lib/ai-ratelimit";

export const runtime = "nodejs";

type TaskBrief = {
  id: string;
  title: string;
  priority: string;
  done: boolean;
  waiting?: boolean;
  waitingFor?: string;
  projectName?: string;
  projectId?: string;
  dueDate?: string;
  tags?: string[];
};

type ProjectBrief = { id: string; name: string };

type ChatMessage = { role: "user" | "assistant"; content: string };

type EventBrief = {
  date: string;
  start: string;
  end: string;
  summary: string;
  calendar?: string;
};

type FreeSlotBrief = {
  date: string;
  start: string;
  end: string;
  minutes: number;
};

type ChatInput = {
  messages: ChatMessage[];
  tasks: TaskBrief[];
  projects: ProjectBrief[];
  today: string;
  events?: EventBrief[];
  freeSlotsToday?: FreeSlotBrief[];
  hasGoogleConnected?: boolean;
  profile?: string;
};

// ============= TOOLS (Claude can invoke these) =============

const TOOLS = [
  {
    name: "create_task",
    description: "Crée une nouvelle tâche. Utilise ce tool quand l'utilisateur dit 'ajoute', 'rappelle-moi', 'crée une tâche pour X'.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Titre clair et concis de la tâche." },
        priority: { type: "string", enum: ["urgent", "high", "medium", "low", "none"] },
        projectId: { type: ["string", "null"], description: "ID du projet cible. null si boîte de réception." },
        tags: { type: "array", items: { type: "string" } },
        dueDate: { type: ["string", "null"], description: "Date au format YYYY-MM-DD. null si aucune." },
        dueTime: { type: ["string", "null"], description: "Heure HH:MM (24h). null si aucune." },
        estimateMinutes: { type: ["number", "null"] },
        notes: { type: ["string", "null"] },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Modifie une tâche existante (priorité, date, projet, notes, tags).",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string", description: "L'ID exact de la tâche à modifier." },
        patch: {
          type: "object",
          properties: {
            title: { type: "string" },
            priority: { type: "string", enum: ["urgent", "high", "medium", "low", "none"] },
            projectId: { type: ["string", "null"] },
            tags: { type: "array", items: { type: "string" } },
            dueDate: { type: ["string", "null"], description: "YYYY-MM-DD ou null pour retirer" },
            dueTime: { type: ["string", "null"] },
            estimateMinutes: { type: ["number", "null"] },
            notes: { type: ["string", "null"] },
            waiting: { type: "boolean" },
            waitingFor: { type: ["string", "null"] },
          },
        },
      },
      required: ["taskId", "patch"],
    },
  },
  {
    name: "complete_tasks",
    description: "Marque comme fait une ou plusieurs tâches.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskIds: { type: "array", items: { type: "string" } },
      },
      required: ["taskIds"],
    },
  },
  {
    name: "delete_tasks",
    description: "Met des tâches à la corbeille (restorable 30 jours).",
    input_schema: {
      type: "object" as const,
      properties: {
        taskIds: { type: "array", items: { type: "string" } },
      },
      required: ["taskIds"],
    },
  },
  {
    name: "reschedule_tasks",
    description: "Reporte une ou plusieurs tâches à une date.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskIds: { type: "array", items: { type: "string" } },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["taskIds", "dueDate"],
    },
  },
  {
    name: "create_project",
    description: "Crée un nouveau projet.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Nom du projet" },
        color: { type: "string", description: "Code hex de couleur, ex #6366f1. Optionnel." },
      },
      required: ["name"],
    },
  },
  {
    name: "rename_project",
    description: "Renomme un projet existant.",
    input_schema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string" },
        newName: { type: "string" },
      },
      required: ["projectId", "newName"],
    },
  },
  {
    name: "recolor_project",
    description: "Change la couleur d'un projet.",
    input_schema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string" },
        color: { type: "string", description: "Code hex, ex: #f97316" },
      },
      required: ["projectId", "color"],
    },
  },
  {
    name: "delete_project",
    description: "Supprime un projet. Les tâches du projet deviennent sans projet (à trier).",
    input_schema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "auto_schedule",
    description: "Place automatiquement plusieurs tâches dans les créneaux libres de l'agenda Google de l'utilisateur. Pour aujourd'hui ou un autre jour. Set dueDate=date et dueTime intelligemment selon les free slots.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskIds: { type: "array", items: { type: "string" }, description: "IDs des tâches à planifier" },
        date: { type: "string", description: "Date cible YYYY-MM-DD (ex: aujourd'hui)" },
      },
      required: ["taskIds", "date"],
    },
  },
  {
    name: "break_down_task",
    description: "Décompose une tâche complexe en sous-tâches actionnables et les ajoute à la tâche-mère. Utilise quand l'utilisateur dit 'décompose', 'détaille', 'étoffe cette tâche'.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string", description: "ID de la tâche à décomposer" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "block_calendar",
    description: "Crée un événement Google Calendar bloqué pour une tâche. Utile pour réserver du temps focus dans ton agenda. Nécessite que la tâche ait dueDate + dueTime + estimateMinutes (sinon les calculer raisonnablement).",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string", description: "ID de la tâche à bloquer" },
        dueDate: { type: "string", description: "YYYY-MM-DD (si la tâche n'en a pas)" },
        dueTime: { type: "string", description: "HH:MM (si la tâche n'en a pas)" },
        estimateMinutes: { type: "number", description: "Durée en minutes (si la tâche n'en a pas)" },
      },
      required: ["taskId"],
    },
  },
];

export async function POST(req: Request) {
  if (!hasApiKey()) {
    return Response.json({ error: "ANTHROPIC_API_KEY non configurée côté serveur." }, { status: 501 });
  }
  const rl = checkRateLimit("chat", req.headers);
  if (!rl.ok) {
    return Response.json({ error: `Trop de requêtes. Réessaie dans ${Math.ceil(rl.retryAfter / 60)} minutes.` }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  const budget = checkDailyBudget(req.headers);
  if (!budget.ok) {
    return Response.json({ error: `Budget IA quotidien atteint (${budget.current.toFixed(3)}$). Reset à minuit UTC.` }, { status: 429 });
  }

  let body: ChatInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalide" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages requis" }, { status: 400 });
  }

  const contextLines = body.tasks.slice(0, 300).map((t) => {
    const bits: string[] = [`[${t.id}] « ${t.title} »`];
    bits.push(`prio=${t.priority}`);
    if (t.projectName) bits.push(`projet=${t.projectName}(${t.projectId})`);
    if (t.dueDate) bits.push(`échéance=${t.dueDate}`);
    if (t.done) bits.push("FAIT");
    if (t.waiting) bits.push(t.waitingFor ? `ATTENTE (${t.waitingFor})` : "ATTENTE");
    if (t.tags && t.tags.length > 0) bits.push(`tags=${t.tags.join(",")}`);
    return bits.join(" · ");
  }).join("\n");

  const projectLines = body.projects.map((p) => `${p.id} = ${p.name}`).join("\n") || "(aucun)";

  const eventLines = (body.events ?? [])
    .slice(0, 60)
    .map((e) => `- ${e.date} ${e.start}-${e.end} : ${e.summary}${e.calendar ? ` [${e.calendar}]` : ""}`)
    .join("\n");

  const slotLines = (body.freeSlotsToday ?? [])
    .map((s) => `- ${s.start} → ${s.end} (${s.minutes} min libres)`)
    .join("\n");

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
      text: `Tu es Vague, un assistant de productivité expert qui agit sur les tâches ET l'agenda de l'utilisateur via tools.

STYLE :
- Français, concret, direct, tutoiement.
- Réponses courtes par défaut (1-3 phrases).
- N'expose JAMAIS les IDs en texte — utilise les titres entre guillemets.
- Quand tu utilises un tool, confirme brièvement après ("Fait — bloqué jeudi 9h").
- Quand l'utilisateur POSE UNE QUESTION (sans demander d'action), réponds en texte sans tool.

CAPACITÉS :
- Créer / modifier / cocher / supprimer / reporter des tâches
- Auto-planifier plusieurs tâches dans les créneaux libres de l'agenda Google (auto_schedule)
- Décomposer une tâche complexe en sous-tâches actionables (break_down_task)
- Bloquer une tâche dans Google Calendar (block_calendar)
- Gérer les projets (créer / renommer / recolorier)

UTILISATION INTELLIGENTE :
- "Trouve-moi 2h pour la compta demain" → analyse les free slots, propose une heure, crée/modifie la tâche, bloque dans agenda si pertinent.
- "Décompose la tâche ouverture du resto" → utilise break_down_task.
- "Quel est mon meilleur créneau cette semaine ?" → analyse l'agenda et réponds.
- "Planifie ma journée" → utilise auto_schedule sur les tâches urgentes/importantes.

ROUND-TRIPS :
- Tu peux enchaîner plusieurs tools dans une réponse (ex: créer une tâche + l'auto_schedule + block_calendar).
- Si plusieurs tâches matchent un terme vague ("les courses"), demande confirmation avant d'agir.

LIMITES :
- N'invente pas d'IDs. Utilise uniquement ceux fournis ci-dessous.
- Si l'utilisateur n'a pas connecté Google, dis-le quand il demande des actions agenda.

PROFIL UTILISATEUR :
- Si un profil est fourni ci-dessus, utilise-le pour personnaliser TOUTES tes réponses.
- Mentionne ses lieux/projets/personnes par leurs noms réels.
- Respecte ses préférences et habitudes.`,
      cache_control: { type: "ephemeral" as const },
    });

  systemBlocks.push({
      type: "text" as const,
      text: `Date : ${body.today}

PROJETS :
${projectLines}

TÂCHES (${body.tasks.length}) :
${contextLines || "(aucune)"}

${body.hasGoogleConnected ? `=== AGENDA GOOGLE CONNECTÉ ===

Événements à venir (60 prochains jours) :
${eventLines || "(aucun)"}

Créneaux libres aujourd'hui (8h-19h, hors events) :
${slotLines || "(agenda plein ou aucun créneau ≥15min)"}` : "Google Calendar : NON connecté. Les tools auto_schedule et block_calendar ne fonctionneront pas."}`,
      cache_control: { type: "ephemeral" as const },
    });

  try {
    // Non-streaming this time because tool calls need the full response.
    // We stream back as NDJSON events: {type: "text", text: ...} | {type: "tool", name, input}
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const response = await anthropic().messages.create({
            model: CHAT_MODEL,
            max_tokens: 2048,
            system: systemBlocks,
            tools: TOOLS,
            messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
          });

          for (const block of response.content) {
            if (block.type === "text") {
              controller.enqueue(encoder.encode(JSON.stringify({ type: "text", text: block.text }) + "\n"));
            } else if (block.type === "tool_use") {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "tool", id: block.id, name: block.name, input: block.input }) + "\n"
                )
              );
            }
          }

          const cost = estimateCost(CHAT_MODEL, {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
            cacheRead: response.usage.cache_read_input_tokens ?? 0,
            cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
          });
          recordSpend(req.headers, cost);
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done", cost }) + "\n"));
          controller.close();
        } catch (err) {
          console.error("Chat error:", err);
          const msg = err instanceof Error ? err.message : "Erreur inconnue";
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: msg }) + "\n"));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return handleAnthropicError(err);
  }
}

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

type ChatInput = {
  messages: ChatMessage[];
  tasks: TaskBrief[];
  projects: ProjectBrief[];
  today: string;
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

  const systemBlocks = [
    {
      type: "text" as const,
      text: `Tu es Vague, un assistant de productivité qui PEUT agir sur les tâches de l'utilisateur via les tools fournis.

Style :
- Français, concret, direct, tutoiement.
- Réponses courtes par défaut (1-3 phrases).
- Utilise les tools QUAND L'UTILISATEUR DEMANDE UNE ACTION : créer, cocher, reporter, supprimer, modifier.
- Quand tu utilises un tool, confirme brièvement après ("Fait · tâche ajoutée au projet X").
- Quand l'utilisateur POSE UNE QUESTION (sans demander d'action), réponds en texte sans tool.

Règles pour les tools :
- create_task : extrais intelligemment projet, priorité, tags depuis le contexte utilisateur. Si l'utilisateur dit "demain" calcule la date.
- update_task / complete_tasks / delete_tasks / reschedule_tasks : utilise uniquement des IDs qui existent dans la liste ci-dessous.
- Si plusieurs tâches matchent un terme vague ("les courses"), demande confirmation avant d'agir.
- Ne cite JAMAIS les IDs dans tes réponses texte — utilise les titres entre guillemets.`,
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: `Date : ${body.today}

PROJETS :
${projectLines}

TÂCHES (${body.tasks.length}) :
${contextLines || "(aucune)"}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

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

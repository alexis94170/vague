import { anthropic, CHAT_MODEL, handleAnthropicError, hasApiKey } from "../../../lib/ai-shared";

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

type PlanInput = {
  tasks: TaskBrief[];
  today: string;
  availableMinutes?: number;
  focus?: string;
};

const PLAN_TOOL = {
  name: "propose_daily_plan",
  description: "Sélectionne 5 à 7 tâches à traiter aujourd'hui parmi la liste, en équilibrant urgence, projets, et estimations de temps.",
  input_schema: {
    type: "object" as const,
    properties: {
      selectedIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs des tâches choisies pour aujourd'hui (5 à 7, sauf si la liste est plus courte).",
      },
      reasoning: {
        type: "string",
        description: "Explication courte en français (2-4 phrases) sur pourquoi cette sélection : quelles priorités, quel équilibre, quelles tâches en retard traitées.",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Avertissements éventuels (ex: 'Tu as 4 tâches urgentes en retard, considère en reporter certaines'). Vide si rien à signaler.",
      },
    },
    required: ["selectedIds", "reasoning", "warnings"],
    additionalProperties: false,
  },
};

export async function POST(req: Request) {
  if (!hasApiKey()) {
    return Response.json({ error: "ANTHROPIC_API_KEY non configurée côté serveur." }, { status: 501 });
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

  const systemBlocks = [
    {
      type: "text" as const,
      text: `Tu es un coach de productivité qui aide à choisir les 5-7 tâches les plus importantes pour aujourd'hui.

Principes :
- Priorise les tâches en retard urgentes/hautes > dues aujourd'hui > priorités hautes non-datées.
- Équilibre entre projets (n'enferme pas la journée dans un seul projet).
- Respecte le budget de temps si donné.
- Ne sélectionne PAS de tâches avec priorité "none" sauf si la liste urgent/high est déjà pleine.
- Appelle propose_daily_plan en sortie, toujours.`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

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

  const userMessage = `Aujourd'hui : ${body.today}
${body.availableMinutes ? `Temps dispo estimé : ${body.availableMinutes} min\n` : ""}${body.focus ? `Focus particulier : ${body.focus}\n` : ""}
Tâches candidates (${body.tasks.length}) :
${taskLines}

Propose 5-7 tâches à traiter aujourd'hui.`;

  try {
    const response = await anthropic().messages.create({
      model: CHAT_MODEL,
      max_tokens: 2048,
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
      selectedIds: string[];
      reasoning: string;
      warnings: string[];
    };
    // Filter to only valid IDs
    const validIds = new Set(body.tasks.map((t) => t.id));
    out.selectedIds = out.selectedIds.filter((id) => validIds.has(id));
    return Response.json({
      ...out,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
      },
    });
  } catch (err) {
    return handleAnthropicError(err);
  }
}

import { anthropic, CLASSIFY_MODEL, handleAnthropicError, hasApiKey } from "../../../lib/ai-shared";

export const runtime = "nodejs";

type ClassifyInput = {
  title: string;
  projects: Array<{ id: string; name: string }>;
  existingTags: string[];
};

type ClassifyOutput = {
  priority: "urgent" | "high" | "medium" | "low" | "none";
  projectId: string | null;
  tags: string[];
  subtasks: string[];
  note?: string;
};

const CLASSIFY_TOOL = {
  name: "classify_task",
  description: "Analyse le titre d'une tâche et détermine le projet adapté, la priorité, les tags pertinents et des sous-tâches si la tâche est complexe.",
  input_schema: {
    type: "object" as const,
    properties: {
      priority: {
        type: "string",
        enum: ["urgent", "high", "medium", "low", "none"],
        description: "urgent = à faire immédiatement · high = important bientôt · medium = à planifier · low = si le temps · none = pas de priorité",
      },
      projectId: {
        type: ["string", "null"],
        description: "ID d'un projet existant qui correspond. null si aucun ne correspond clairement.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "1-3 tags courts en minuscule (sans #), réutilise les tags existants quand c'est pertinent.",
      },
      subtasks: {
        type: "array",
        items: { type: "string" },
        description: "Si la tâche est complexe (ex: 'Organiser anniversaire'), propose 3-6 sous-tâches courtes. Sinon tableau vide.",
      },
      note: {
        type: "string",
        description: "Note courte optionnelle (≤ 120 caractères) avec contexte utile.",
      },
    },
    required: ["priority", "projectId", "tags", "subtasks"],
    additionalProperties: false,
  },
};

export async function POST(req: Request) {
  if (!hasApiKey()) {
    return Response.json({ error: "ANTHROPIC_API_KEY non configurée côté serveur." }, { status: 501 });
  }

  let body: ClassifyInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalide" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return Response.json({ error: "title requis" }, { status: 400 });
  }

  // Stable system prompt with cache_control — projects list varies rarely, put after
  const systemBlocks = [
    {
      type: "text" as const,
      text: `Tu es un assistant qui classe des tâches pour une application de gestion.
Ta sortie est TOUJOURS un appel au tool classify_task, sans texte hors-tool.

Règles :
- Choisis la priorité uniquement d'après le sens/urgence de la tâche.
- Pour projectId, match par nom de projet (insensible à la casse et accents) ou par thème. Si rien ne matche clairement, mets null.
- Pour les tags, préfère des mots existants ; sinon invente 1-3 tags courts.
- Subtasks : uniquement si la tâche est manifestement un "gros morceau". Sinon [].
- Pas d'emoji dans les tags. Pas de ponctuation inutile.`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const projectLines = body.projects.map((p) => `- ${p.id} : ${p.name}`).join("\n") || "(aucun projet)";
  const tagLine = body.existingTags.length > 0 ? body.existingTags.map((t) => `#${t}`).join(", ") : "(aucun tag existant)";

  const userMessage = `Projets disponibles :\n${projectLines}\n\nTags déjà utilisés : ${tagLine}\n\nTâche à classer : « ${body.title.trim()} »`;

  try {
    const response = await anthropic().messages.create({
      model: CLASSIFY_MODEL,
      max_tokens: 1024,
      system: systemBlocks,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_task" },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({ error: "Réponse IA invalide" }, { status: 502 });
    }
    const out = toolUse.input as ClassifyOutput;
    // Validate projectId actually exists
    if (out.projectId && !body.projects.find((p) => p.id === out.projectId)) {
      out.projectId = null;
    }
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

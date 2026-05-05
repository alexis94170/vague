import { anthropic, CHAT_MODEL, handleAnthropicError, hasApiKey } from "../../../lib/ai-shared";
import { checkDailyBudget, checkRateLimit, estimateCost, recordSpend } from "../../../lib/ai-ratelimit";

export const runtime = "nodejs";

type BreakdownInput = {
  title: string;
  notes?: string;
  projectName?: string;
  estimateMinutes?: number;
  context?: string; // additional context (other tasks in project, etc.)
};

const BREAKDOWN_TOOL = {
  name: "break_down_task",
  description: "Décompose une tâche complexe en sous-tâches concrètes et actionnables, organisées en sections logiques.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description: "Résumé en 1 phrase de ce que la tâche implique vraiment et de l'approche proposée. ~25 mots.",
      },
      sections: {
        type: "array",
        description: "Sections / catégories de sous-tâches. 1 section minimum, max 6. Chaque section regroupe des étapes liées.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Nom court de la section (ex: 'Préparation', 'Administratif', 'Marketing'). Vide si tâche simple sans sections.",
            },
            steps: {
              type: "array",
              description: "Étapes concrètes (3-10 par section). Chacune est une action atomique, commençant par un verbe à l'infinitif.",
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Titre court (5-12 mots) commençant par un verbe. Ex: 'Réserver salle pour 50 personnes', 'Envoyer email confirmation aux invités'.",
                  },
                  estimateMinutes: {
                    type: "number",
                    description: "Durée estimée en minutes (5 à 240).",
                  },
                  daysOffset: {
                    type: "number",
                    description: "Nombre de jours à partir d'aujourd'hui pour cette étape (0 = aujourd'hui, 1 = demain, etc.). Utiliser des chiffres réalistes en respectant l'ordre logique des étapes. -1 si pas de date particulière.",
                  },
                },
                required: ["title", "estimateMinutes", "daysOffset"],
                additionalProperties: false,
              },
            },
          },
          required: ["name", "steps"],
          additionalProperties: false,
        },
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "1-3 tags transversaux pertinents pour la tâche-mère (sans #, en minuscules).",
      },
    },
    required: ["summary", "sections", "tags"],
    additionalProperties: false,
  },
};

export async function POST(req: Request) {
  if (!hasApiKey()) {
    return Response.json({ error: "ANTHROPIC_API_KEY non configurée côté serveur." }, { status: 501 });
  }
  const rl = checkRateLimit("breakdown", req.headers);
  if (!rl.ok) {
    return Response.json({ error: `Trop de requêtes. Réessaie dans ${Math.ceil(rl.retryAfter / 60)} minutes.` }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  const budget = checkDailyBudget(req.headers);
  if (!budget.ok) {
    return Response.json({ error: `Budget IA quotidien atteint (${budget.current.toFixed(3)}$).` }, { status: 429 });
  }

  let body: BreakdownInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalide" }, { status: 400 });
  }
  if (!body.title || body.title.length < 3) {
    return Response.json({ error: "title requis (>= 3 chars)" }, { status: 400 });
  }

  const systemBlocks = [
    {
      type: "text" as const,
      text: `Tu es un coach exécutif qui aide à décomposer des tâches complexes en checklist actionnable.

PRINCIPES :
- Reste pragmatique : seulement les étapes vraiment nécessaires.
- Étapes ATOMIQUES : chacune est une action concrète qu'on peut faire en une fois (pas une catégorie).
- Verbe à l'infinitif au début (Réserver, Envoyer, Appeler, Vérifier, Préparer, Confirmer, etc.).
- Pas de préambule du genre "Définir l'objectif" — entre directement dans le concret.
- Sections seulement si la tâche est large (>10 sous-tâches). Sinon, une seule section avec name="".
- Estimations réalistes : 5-15 min pour un appel, 30-60 min pour rédaction, 60-120 min pour un travail substantiel.
- daysOffset : ordonner logiquement, espacer des étapes qui ne peuvent pas s'enchaîner (ex: attendre une réponse).

EXEMPLE DE BONNE DÉCOMPOSITION pour "Préparer ouverture du resto" :
Section "Administratif" : ["Vérifier statut SIRET", "Souscrire RC pro", "Déposer dossier hygiène DDPP"]
Section "Cuisine" : ["Acheter robot Magimix", "Lister fournisseurs locaux", "Tester 3 recettes plat du jour"]
Pas : ["Définir le concept", "Réfléchir au menu" (trop vague)]`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const userMessage = `Tâche à décomposer : « ${body.title} »
${body.notes ? `\nNotes existantes :\n${body.notes}\n` : ""}${body.projectName ? `\nProjet : ${body.projectName}` : ""}${body.estimateMinutes ? `\nEstimation actuelle : ${body.estimateMinutes} min` : ""}${body.context ? `\n\nContexte :\n${body.context}` : ""}

Décompose-la en checklist actionnable.`;

  try {
    const response = await anthropic().messages.create({
      model: CHAT_MODEL,
      max_tokens: 4096,
      system: systemBlocks,
      tools: [BREAKDOWN_TOOL],
      tool_choice: { type: "tool", name: "break_down_task" },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({ error: "Réponse IA invalide" }, { status: 502 });
    }
    const out = toolUse.input as {
      summary: string;
      sections: Array<{
        name: string;
        steps: Array<{ title: string; estimateMinutes: number; daysOffset: number }>;
      }>;
      tags: string[];
    };
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

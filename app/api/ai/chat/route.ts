import { anthropic, CHAT_MODEL, handleAnthropicError, hasApiKey } from "../../../lib/ai-shared";

export const runtime = "nodejs";

type TaskBrief = {
  id: string;
  title: string;
  priority: string;
  done: boolean;
  waiting?: boolean;
  waitingFor?: string;
  projectName?: string;
  dueDate?: string;
  tags?: string[];
};

type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatInput = {
  messages: ChatMessage[];
  tasks: TaskBrief[];
  today: string;
};

export async function POST(req: Request) {
  if (!hasApiKey()) {
    return Response.json({ error: "ANTHROPIC_API_KEY non configurée côté serveur." }, { status: 501 });
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

  // Build context block with all tasks — cached separately from the conversation
  const contextLines = body.tasks.slice(0, 300).map((t) => {
    const bits: string[] = [`[${t.id}] « ${t.title} »`];
    bits.push(`prio=${t.priority}`);
    if (t.projectName) bits.push(`projet=${t.projectName}`);
    if (t.dueDate) bits.push(`échéance=${t.dueDate}`);
    if (t.done) bits.push("FAIT");
    if (t.waiting) bits.push(t.waitingFor ? `ATTENTE (${t.waitingFor})` : "ATTENTE");
    if (t.tags && t.tags.length > 0) bits.push(`tags=${t.tags.join(",")}`);
    return bits.join(" · ");
  }).join("\n");

  const systemBlocks = [
    {
      type: "text" as const,
      text: `Tu es Vague, un assistant de productivité personnel intégré dans une app de gestion de tâches.

Style :
- Réponds en français, ton concret, direct, bienveillant.
- Réponses courtes par défaut (2-4 phrases). Plus détaillé seulement si on te le demande.
- Cite des tâches en utilisant leur titre entre guillemets, pas leur ID.
- Quand tu proposes une action (reporter, cocher, créer), sois spécifique et précis.
- Si on te demande quoi faire aujourd'hui, identifie 3-5 tâches clés avec raison.
- Si on te demande d'analyser ou grouper, structure avec des listes courtes.
- N'invente pas de tâches qui ne sont pas dans la liste. Si rien ne correspond, dis-le.`,
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: `Date du jour : ${body.today}\n\nLes tâches de l'utilisateur :\n${contextLines || "(aucune tâche)"}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  try {
    // Stream for responsive UX
    const stream = await anthropic().messages.stream({
      model: CHAT_MODEL,
      max_tokens: 2048,
      system: systemBlocks,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return handleAnthropicError(err);
  }
}

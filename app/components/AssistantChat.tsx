"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { aiChat } from "../lib/ai-client";
import { haptic } from "../lib/haptics";
import Icon from "./Icon";

type Msg = { role: "user" | "assistant"; content: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

const SUGGESTIONS = [
  "Qu'est-ce que je fais en priorité aujourd'hui ?",
  "Quelles tâches sont en retard ?",
  "Regroupe mes tâches Indiana Café par urgence",
  "Quelles tâches attendent un retour externe ?",
];

export default function AssistantChat({ open, onClose }: Props) {
  const { tasks, projects } = useStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const userMsg: Msg = { role: "user", content };
    const newMessages = [...messages, userMsg, { role: "assistant" as const, content: "" }];
    setMessages(newMessages);
    setInput("");
    setError(null);
    setLoading(true);
    haptic("light");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await aiChat(
        [...messages, userMsg],
        tasks,
        projects,
        (chunk) => {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              content: next[next.length - 1].content + chunk,
            };
            return next;
          });
        },
        controller.signal
      );
      haptic("light");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
      haptic("warning");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setError(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 anim-fade-in sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-[var(--bg-elev)] shadow-2xl anim-scale-in sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-[var(--border)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 safe-top">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
              <Icon name="sparkles" size={15} />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight">Assistant Vague</h2>
              <div className="text-[11px] text-[var(--text-muted)]">Je connais tes {tasks.length} tâches</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button onClick={reset} className="rounded-md px-2 py-1 text-[11.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">Nouveau</button>
            )}
            <button onClick={onClose} className="tappable flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="text-[13px] text-[var(--text-muted)]">
                  Je peux t&apos;aider à organiser, prioriser, ou analyser tes tâches. Essaie une de ces questions :
                </div>
              </div>
              <div className="space-y-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="flex w-full items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-left text-[13px] text-[var(--text)] transition hover:border-[var(--accent)]/30 hover:bg-[var(--accent-soft)]"
                  >
                    <Icon name="sparkles" size={13} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg)] text-[var(--text)]"
                  }`}>
                    {m.content || (loading && i === messages.length - 1 ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-50" />
                        <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-50" style={{ animationDelay: "150ms" }} />
                        <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-50" style={{ animationDelay: "300ms" }} />
                      </span>
                    ) : "")}
                  </div>
                </div>
              ))}
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3 safe-bottom"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Demande-moi quelque chose…"
              className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--accent)]/40"
              style={{ maxHeight: 120 }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition active:scale-95 disabled:opacity-40"
            >
              <Icon name="arrow-right" size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";

type Props = { text: string; className?: string };

// Lightweight markdown renderer — no external deps.
// Supports: paragraphs, bullet/numbered lists, headings, bold, italic, code (inline + block),
// links, checkbox lists, line breaks.
function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(s: string): string {
  let out = escapeHTML(s);
  // inline code `code`
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-[var(--bg-hover)] px-1 py-0.5 font-mono text-[12px]">$1</code>');
  // bold **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // italic *text* or _text_
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  // links [text](url)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] underline decoration-dotted underline-offset-2">$1</a>'
  );
  // auto-link bare URLs
  out = out.replace(
    /(^|\s)(https?:\/\/[^\s<]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] underline decoration-dotted underline-offset-2">$2</a>'
  );
  return out;
}

function renderMarkdown(src: string): string {
  if (!src) return "";
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // code fence ```
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(escapeHTML(lines[i]));
        i++;
      }
      i++;
      out.push(`<pre class="my-2 overflow-x-auto rounded-md bg-[var(--bg-hover)] p-3 font-mono text-[12px] leading-relaxed"><code>${code.join("\n")}</code></pre>`);
      continue;
    }

    // headings
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "text-[16px] font-semibold" : level === 2 ? "text-[14.5px] font-semibold" : "text-[13px] font-semibold";
      out.push(`<h${level} class="mt-3 ${cls}">${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // checkbox list
    if (/^\s*[-*]\s\[[ xX]\]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s\[[ xX]\]\s/.test(lines[i])) {
        const m = lines[i].match(/^\s*[-*]\s\[([ xX])\]\s(.+)$/);
        if (m) {
          const done = m[1].toLowerCase() === "x";
          items.push(
            `<li class="flex items-start gap-2"><span class="mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border-[1.5px] ${
              done ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border-strong)]"
            }">${done ? "✓" : ""}</span><span class="${done ? "text-[var(--text-subtle)] line-through" : ""}">${renderInline(m[2])}</span></li>`
          );
        }
        i++;
      }
      out.push(`<ul class="my-1 space-y-0.5">${items.join("")}</ul>`);
      continue;
    }

    // bullet list
    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        const m = lines[i].match(/^\s*[-*]\s(.+)$/);
        if (m) items.push(`<li>${renderInline(m[1])}</li>`);
        i++;
      }
      out.push(`<ul class="my-1 list-disc space-y-0.5 pl-5">${items.join("")}</ul>`);
      continue;
    }

    // numbered list
    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        const m = lines[i].match(/^\s*\d+\.\s(.+)$/);
        if (m) items.push(`<li>${renderInline(m[1])}</li>`);
        i++;
      }
      out.push(`<ol class="my-1 list-decimal space-y-0.5 pl-5">${items.join("")}</ol>`);
      continue;
    }

    // blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // paragraph (gather until blank)
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#|-|\*|\d+\.|```)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p class="my-1">${renderInline(para.join(" "))}</p>`);
  }
  return out.join("");
}

export default function MarkdownPreview({ text, className = "" }: Props) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div
      className={`prose-sm max-w-none text-[13px] leading-relaxed text-[var(--text)] ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

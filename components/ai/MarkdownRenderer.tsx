"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Safely unwrap and format any JSON string, serialized response,
 * or markdown code-fence wrapper so raw JSON is never displayed to the user.
 */
export function unwrapJsonString(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let trimmed = raw.trim();

  // If inside ```json ... ``` codeblock
  if (trimmed.startsWith("```json") && trimmed.endsWith("```")) {
    const inner = trimmed.slice(7, -3).trim();
    try {
      const parsed = JSON.parse(inner);
      if (parsed && typeof parsed.answer === "string") {
        return unwrapJsonString(parsed.answer);
      }
      if (parsed && Array.isArray(parsed.leads)) {
        return formatLeadsToMarkdown(parsed.leads);
      }
    } catch {
      // not valid json, strip fence
      trimmed = inner;
    }
  }

  // If raw JSON object string
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.answer === "string") {
        return unwrapJsonString(parsed.answer);
      }
      if (parsed && Array.isArray(parsed.leads)) {
        return formatLeadsToMarkdown(parsed.leads);
      }
    } catch {
      // not json, leave as is
    }
  }

  return trimmed;
}

function formatLeadsToMarkdown(leads: any[]): string {
  if (!leads || leads.length === 0) return "No leads matching the specified criteria.";
  const header = `| Lead ID | Company Name | Stage / Status | Days Stalled | Audio Status | Evidence |\n|---|---|---|---|---|---|`;
  const rows = leads.map((l) => {
    const id = l.leadId || l.leadCode || "N/A";
    const name = l.companyName || l.name || "N/A";
    const stage = `${l.stage || l.currentDepartment || "vigilance"} (${l.status || "in_progress"})`;
    const days = l.daysSinceLastActivity ?? l.daysSinceActivity ?? l.daysStalled ?? 0;
    const audio = l.audioStatus || "missing";
    const evidence = l.evidence || "Database record";
    return `| **${id}** | ${name} | ${stage} | ${days}d | **${audio}** | ${evidence} |`;
  });
  return `${header}\n${rows.join("\n")}`;
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const cleanContent = useMemo(() => unwrapJsonString(content), [content]);

  return (
    <div className={cn("text-xs leading-relaxed break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-3 w-full rounded-xl border border-border/80 bg-background/60 shadow-neu-inset-sm">
              <table className="w-full text-left text-xs border-collapse" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead
              className="bg-muted/70 text-foreground text-[11px] font-bold border-b border-border/70"
              {...props}
            />
          ),
          th: ({ node, ...props }) => (
            <th
              className="px-3.5 py-2.5 font-semibold text-foreground border-b border-border/60 whitespace-nowrap"
              {...props}
            />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-border/40" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-muted/30 transition-colors" {...props} />
          ),
          td: ({ node, children, ...props }) => {
            const textValue = String(children).toLowerCase();
            const isMissing = textValue.includes("missing");
            const isVerified = textValue.includes("verified") && !isMissing;
            const isAwaiting = textValue.includes("awaiting");

            return (
              <td
                className={cn(
                  "px-3.5 py-2 text-[11px] text-foreground/90 align-middle",
                  isMissing && "text-amber-700 dark:text-amber-400 font-medium",
                  isVerified && "text-emerald-700 dark:text-emerald-400 font-medium",
                  isAwaiting && "text-blue-700 dark:text-blue-400 font-medium"
                )}
                {...props}
              >
                {children}
              </td>
            );
          },
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-foreground" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic text-foreground/90" {...props} />
          ),
          h1: ({ node, ...props }) => (
            <h1 className="text-sm font-bold text-foreground mt-3 mb-1.5" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-xs font-bold text-foreground mt-2.5 mb-1" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-xs font-semibold text-foreground mt-2 mb-1" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-4 space-y-1 my-2 text-xs text-foreground/90" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-4 space-y-1 my-2 text-xs text-foreground/90" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="mb-2 last:mb-0 leading-relaxed text-foreground/95" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-2"
              {...props}
            />
          ),
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[11px] text-primary font-semibold"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <div className="overflow-x-auto my-2 rounded-xl bg-muted/50 p-3 border border-border/70 font-mono text-[11px] text-foreground">
                <code {...props}>{children}</code>
              </div>
            );
          },
          a: ({ node, href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
}

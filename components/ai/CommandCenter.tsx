"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, RefreshCw, Database, ArrowRight, RotateCcw, AlertTriangle } from "lucide-react";
import { aiService, CommandCenterResponse, ChatHistoryMessage } from "@/services/ai.service";
import { AiBadge } from "./AiBadge";
import { MarkdownRenderer, unwrapJsonString } from "./MarkdownRenderer";
import { VANexusLogo } from "@/components/ui/va-nexus-logo";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SAMPLE_QUESTIONS = [
  "How many leads are in each pipeline stage right now?",
  "Which leads have been stalled for more than 3 days?",
  "Are there any leads stuck without audio in Vigilance?",
  "What is the audio verification status of leads in Vigilance?",
  "What is our overall conversion rate and win count?",
  "Show me leads currently assigned to me",
];

interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  suggestedFollowUps?: string[];
  disclaimer?: string;
  isError?: boolean;
  failedQuestion?: string;
  timestamp: Date;
}

export function CommandCenter() {
  const { user, role } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendQuestion = async (q: string) => {
    if (!q.trim() || loading) return;
    const cleanQuestion = q.trim();
    setInput("");

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      type: "user",
      content: cleanQuestion,
      timestamp: new Date(),
    };

    // Prepare previous history to send (excluding errors, mapped to user | model)
    const historyToSend: ChatHistoryMessage[] = messages
      .filter((m) => !m.isError && m.content.trim().length > 0)
      .slice(-8)
      .map((m) => ({
        role: m.type === "user" ? "user" : "model",
        content: m.content,
      }));

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const data: CommandCenterResponse = await aiService.queryCommandCenter(
        cleanQuestion,
        historyToSend
      );

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        type: "assistant",
        content: unwrapJsonString(data.answer),
        toolsUsed: data.toolsUsed,
        suggestedFollowUps: data.suggestedFollowUps,
        disclaimer: data.disclaimer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg =
        err?.message ||
        "The AI service could not generate a response. Please verify that OPENROUTER_API_KEY is configured on the server.";
      toast.error("VA Nexus Copilot Error", { description: errorMsg });

      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          type: "assistant",
          content: `Unable to complete request: ${errorMsg}`,
          disclaimer: "Ensure backend AI services and database connections are operational.",
          isError: true,
          failedQuestion: cleanQuestion,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      // Re-focus input after completion
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && input.trim()) {
        sendQuestion(input);
      }
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] rounded-2xl border border-border/80 bg-card shadow-neu-raised dark:shadow-none overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-3 bg-muted/20">
        <div className="flex items-center gap-3">
          <VANexusLogo variant="icon" size="sm" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">VA Nexus AI Command Center</h2>
              <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                {role} Mode
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Natural-language operations assistant grounded in live authorized CRM records
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AiBadge label="Nemotron 3.5 (OpenRouter)" />
        </div>
      </div>

      {/* Chat Messages Viewport */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[calc(55vh-10px)] text-center max-w-lg mx-auto py-2">
            <div className="flex h-16 w-16 p-2 items-center justify-center border border-border rounded-3xl bg-blue-100 text-blue-700 shadow-neu-raised dark:bg-blue-950/40 dark:text-blue-300 mb-2">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-1">
              Ask anything about your VA Nexus operations
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-1">
              Venture Automation Nexus — Connect. Automate. Accelerate.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              Inspect pipeline stage counts, detect bottlenecked or stalled leads, verify conversion
              metrics, and review department tasks using verified server-side tools.
            </p>

            <div className="w-full space-y-2">
              <p className="text-[10px] uppercase font-mono font-bold text-muted-foreground tracking-wider text-left">
                Suggested Prompts
              </p>
              {SAMPLE_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => sendQuestion(q)}
                  disabled={loading}
                  className="flex items-center justify-between w-full rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-left text-xs text-foreground shadow-neu-raised-sm hover:border-primary/40 hover:shadow-neu-btn-hover active:shadow-neu-inset disabled:opacity-50 transition-all group"
                >
                  <span className="truncate pr-2">{q}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex flex-col", m.type === "user" ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed",
                  m.type === "user"
                    ? "bg-primary text-primary-foreground shadow-neu-btn font-medium"
                    : m.isError
                      ? "bg-destructive/10 border border-destructive/30 text-destructive dark:text-red-300 shadow-neu-raised-sm"
                      : "bg-card border border-border/80 text-foreground shadow-neu-raised-sm"
                )}
              >
                {/* Assistant metadata header */}
                {m.type === "assistant" && (
                  <div className="flex items-center gap-2 pb-2 mb-2 border-b border-border/50 text-[10px] text-muted-foreground">
                    {m.isError ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    ) : (
                      <VANexusLogo variant="icon" size="sm" className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="font-semibold text-foreground">
                      {m.isError ? "Request Error" : "VA Nexus Copilot"}
                    </span>
                    {m.toolsUsed && m.toolsUsed.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-muted/60 px-1.5 py-0.2 font-mono">
                        <Database className="h-2.5 w-2.5" />
                        {m.toolsUsed.join(", ")}
                      </span>
                    )}
                  </div>
                )}

                {/* Content */}
                {m.type === "user" ? (
                  <div className="whitespace-pre-wrap font-sans">{m.content}</div>
                ) : (
                  <MarkdownRenderer content={m.content} />
                )}

                {/* Retry Button if error */}
                {m.isError && m.failedQuestion && (
                  <div className="mt-3 pt-2 border-t border-destructive/20 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Request could not be fulfilled
                    </span>
                    <button
                      type="button"
                      onClick={() => sendQuestion(m.failedQuestion!)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/20 px-2.5 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/30 active:scale-95 disabled:opacity-50 transition-all"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry Question
                    </button>
                  </div>
                )}

                {/* Follow ups */}
                {m.suggestedFollowUps && m.suggestedFollowUps.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-border/50 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground font-mono">
                      Recommended Follow-ups:
                    </span>
                    <div className="flex flex-col gap-1">
                      {m.suggestedFollowUps.map((fu, fIdx) => (
                        <button
                          key={fIdx}
                          type="button"
                          onClick={() => sendQuestion(fu)}
                          disabled={loading}
                          className="text-left text-[11px] text-primary hover:underline disabled:opacity-50"
                        >
                          → {fu}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Disclaimer */}
                {m.disclaimer && (
                  <p className="mt-2 text-[9px] text-muted-foreground/70 font-mono">
                    {m.disclaimer}
                  </p>
                )}
              </div>
              <span className="text-[9px] text-muted-foreground font-mono px-1 mt-1">
                {m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 max-w-[320px]">
            <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin" />
            <span className="inline-flex flex-wrap  gap-x-1.5 gap-y-1 text-xs font-medium text-muted-foreground">
              <span>Please hold on</span>
              <span className="inline-flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-current animate-dot-typing dot-typing"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </span>
              <span>Consulting VA Nexus CRM database</span>
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Form */}
      <div className="border-t border-border/70 p-3 bg-muted/10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="flex items-end gap-2"
        >
          <div className="relative flex-1">
            <textarea
              autoFocus
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about leads, bottlenecks, verification status, or sales tasks… (Enter to send, Shift+Enter for new line)"
              disabled={loading}
              className="w-full resize-none rounded-xl border border-border/80 bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 shadow-neu-inset-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            />
            <span className="absolute right-2.5 bottom-2 text-[9px] font-mono text-muted-foreground/50 pointer-events-none hidden sm:inline">
              ↵ Enter to send
            </span>
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset disabled:opacity-40 transition-all shrink-0 mb-0.5"
            title="Send query"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

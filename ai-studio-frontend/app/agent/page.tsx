"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_BASE } from "@/lib/apiBase";

export default function AgentPage() {
  const router = useRouter();
  const pathname = usePathname();

  const nav = [
    { label: "Home", href: "/" },
    { label: "Creation", href: "/creation" },
    { label: "Posted", href: "/posted" },
    { label: "Subscribe", href: "/pricing" },
    { label: "Mini Apps", href: "/mini-apps" },
    { label: "Agent", href: "/agent" },
  ];

  type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
  };

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg =
          (data && (data.error || data.message)) ||
          `Agent request failed (HTTP ${res.status} ${res.statusText})`;
        throw new Error(msg);
      }

      const assistantText: string =
        (data.text && String(data.text)) || "(Agent did not return any text.)";

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: assistantText,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error("Agent chat error:", err);
      setError(err?.message || "Agent request failed.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="min-h-screen text-white flex cinematic-bg">
      {/* SIDEBAR (only visible on home; hidden on Agent) */}
      <aside className="hidden">
        <div>
          <div className="p-6 text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-200 via-white to-pink-200 text-transparent bg-clip-text drop-shadow-[0_0_18px_rgba(34,211,238,0.12)]">
            AI Studio
          </div>

          <nav className="px-3 space-y-2">
            {nav.map((n) => {
              const active = pathname === n.href;
              return (
                <button
                  key={n.label}
                  onClick={() => router.push(n.href)}
                  className={`glow-focus w-full text-left px-4 py-3.5 rounded-2xl text-sm font-medium ${
                    active
                      ? "bg-gradient-to-r from-cyan-200 via-white to-pink-200 text-black shadow-[0_18px_70px_rgba(255,255,255,0.12)]"
                      : "glow-pill text-white/80"
                  }`}
                >
                  {n.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 text-xs text-white/60">
          <div className="rounded-3xl bg-black/50 border border-white/10 p-4">
            <div className="font-semibold mb-1">Agent workspace</div>
            <div>
              A future control center where an AI agent can manage batches, schedules, and
              multi-shot pipelines for you.
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-20 border-b border-white/10 flex items-center justify-between px-8 glass-panel">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <div className="glow-pill px-4 py-2 rounded-full text-sm text-white/80 border border-white/10">
                  Agent
                </div>
              </div>
              <div className="text-xs md:text-sm text-white/50">
                Orchestrate multiple generations, manage queues, and connect workflows (coming soon).
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">Agent dashboard</h1>
            <p className="text-sm md:text-base text-white/60 max-w-2xl mb-6">
              This is a styled workspace for an automation-focused view. You can chat with the
              Sailor AI agent below, and in the future queue prompts, schedule runs, and manage
              multi-shot pipelines.
            </p>

            {/* Agent chat box */}
            <section className="rounded-3xl glass-panel border border-white/15 p-4 md:p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">
                    Agent chat
                  </div>
                  <div className="text-xs md:text-sm text-white/65">
                    Ask Sailor AI for ideas, titles, or editing suggestions.
                  </div>
                </div>
              </div>

              <div className="h-64 md:h-72 overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-3 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-white/40 text-center px-4">
                    Start the conversation by typing a prompt below. For example: "Brainstorm 5
                    video ideas for my Sailor AI launch".
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs md:text-sm leading-relaxed whitespace-pre-wrap break-words ${{
                          user: "ml-auto bg-cyan-500/20 border border-cyan-300/60 text-cyan-50",
                          assistant:
                            "mr-auto bg-white/8 border border-white/15 text-white/85",
                        }[m.role]}`}
                      >
                        {m.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-1.5">
                  {error}
                </div>
              )}

              <form
                onSubmit={handleSend}
                className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask the agent anything about your videos, prompts, or edits…"
                  className="flex-1 rounded-2xl border border-white/20 bg-black/60 px-3 py-2 text-xs md:text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400/80"
                />
                <button
                  type="submit"
                  disabled={isSending || !input.trim()}
                  className={`px-4 py-2 rounded-2xl text-xs md:text-sm font-semibold border transition-colors min-w-[90px] text-center ${
                    isSending || !input.trim()
                      ? "border-white/20 bg-white/10 text-white/40 cursor-not-allowed"
                      : "border-cyan-400 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
                  }`}
                >
                  {isSending ? "Thinking…" : "Send"}
                </button>
              </form>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="rounded-3xl glass-panel border border-white/10 p-5 text-sm text-white/70">
                <div className="font-semibold mb-1">Queues</div>
                <div>Monitor and reprioritize active generations.</div>
              </div>
              <div className="rounded-3xl glass-panel border border-white/10 p-5 text-sm text-white/70">
                <div className="font-semibold mb-1">Workflows</div>
                <div>Define sequences of prompts, models, and exports.</div>
              </div>
              <div className="rounded-3xl glass-panel border border-white/10 p-5 text-sm text-white/70">
                <div className="font-semibold mb-1">Integrations</div>
                <div>Connect to tools like YouTube, Drive, or webhooks.</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

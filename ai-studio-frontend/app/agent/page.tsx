"use client";

import { usePathname, useRouter } from "next/navigation";

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
              This is a styled placeholder for an automation-focused view. In a future version, you
              could queue up prompts, schedule runs, and let an AI agent manage batches of renders.
            </p>

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

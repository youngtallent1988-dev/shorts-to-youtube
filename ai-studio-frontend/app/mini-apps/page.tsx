"use client";

import { usePathname, useRouter } from "next/navigation";

const miniApps = [
  {
    id: 1,
    name: "Script to Video",
    description: "Turn a text script into a full cinematic sequence.",
  },
  {
    id: 2,
    name: "Shorts Converter",
    description: "Convert wide videos into vertical Shorts-ready clips.",
  },
  {
    id: 3,
    name: "Template Builder",
    description: "Create reusable prompt templates for series formats.",
  },
];

export default function MiniAppsPage() {
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
      {/* SIDEBAR (only visible on home; hidden on Mini Apps) */}
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
            <div className="font-semibold mb-1">Mini Apps</div>
            <div>
              Lightweight tools that sit on top of the core generator to speed up specific
              workflows.
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
                  Mini Apps
                </div>
              </div>
              <div className="text-xs md:text-sm text-white/50">
                Quick launch tools built on top of your main AI Studio engine.
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Mini Apps</h1>
              <p className="mt-2 text-sm md:text-base text-white/60 max-w-2xl">
                Launch focused workflows like script-to-video, shorts conversion, and template
                building. This page is a styled placeholder; wire each card to a dedicated route
                later.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {miniApps.map((app) => (
                <div
                  key={app.id}
                  className="rounded-3xl glass-panel border border-white/10 p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-sm md:text-base font-semibold mb-1">{app.name}</div>
                    <p className="text-xs md:text-sm text-white/70">{app.description}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-white/55">
                    <span>Coming soon</span>
                    <button className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/80">
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

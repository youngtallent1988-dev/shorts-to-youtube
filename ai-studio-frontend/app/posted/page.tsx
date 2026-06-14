"use client";

import { usePathname, useRouter } from "next/navigation";

const samplePosts = [
  {
    id: 1,
    title: "Fantasy intro sequence",
    type: "Video",
    timeframe: "Last 7 days",
  },
  {
    id: 2,
    title: "Lo-fi study loop",
    type: "Image + Video",
    timeframe: "Last 30 days",
  },
  {
    id: 3,
    title: "Anime action test shot",
    type: "Video",
    timeframe: "Lifetime",
  },
];

export default function PostedPage() {
  const router = useRouter();
  const pathname = usePathname();

  const nav = [
    { label: "Home", href: "/" },
    { label: "Creation", href: "/creation" },
    { label: "My Videos", href: "/" },
    { label: "Posted", href: "/posted" },
    { label: "Subscribe", href: "/pricing" },
    { label: "Templates", href: "/templates" },
  ];

  return (
    <div className="min-h-screen text-white flex cinematic-bg">
      {/* SIDEBAR (only visible on home; hidden on Posted) */}
      <aside className="hidden">
        <div>
          <div className="p-6 text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-200 via-white to-pink-200 text-transparent bg-clip-text drop-shadow-[0_0_18px_rgba(34,211,238,0.12)]">
            SailorAI
          </div>

          <nav className="px-3 space-y-2">
            {nav.map((n) => {
              const active = pathname === n.href;
              return (
                <button
                  key={n.label}
                  onClick={() => router.push(n.href)}
                  className={`glow-focus w-full text-left px-4 py-4 rounded-2xl ${
                    active
                      ? "bg-white text-black font-bold shadow-[0_18px_70px_rgba(255,255,255,0.08)]"
                      : "glow-pill text-white/80"
                  }`}
                >
                  {n.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 text-xs text-white/50">
          <div className="rounded-3xl bg-black/40 border border-white/10 p-4">
            <div className="font-semibold mb-1">Posted gallery</div>
            <div>
              This is where creators will be able to showcase selected work. For now it&apos;s a
              placeholder layout without backend wiring.
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
                  Posted
                </div>
              </div>
              <div className="text-xs md:text-sm text-white/50">
                A future gallery where users can post work and showcase their talent.
              </div>
            </div>
          </div>

          <button
            type="button"
            className="glow-focus glow-primary px-5 py-2 rounded-full text-sm font-black"
          >
            New post (coming soon)
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">Posted work</h1>
                <p className="mt-2 text-sm md:text-base text-white/60 max-w-2xl">
                  Example layout for featured posts. Later this can be driven from a database or
                  user profiles.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {samplePosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-3xl glass-panel border border-white/10 p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-sm md:text-base font-semibold mb-1">{post.title}</div>
                    <div className="text-xs text-white/60">{post.type}</div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-white/55">
                    <span>{post.timeframe}</span>
                    <span className="text-white/70">Preview coming soon</span>
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

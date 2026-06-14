"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";

function SparkIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 1.6l1.2 4.2 4.2 1.2-4.2 1.2L10 12.4 8.8 8.2 4.6 7 8.8 5.8 10 1.6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M15.2 11.2l.8 2.6 2.6.8-2.6.8-.8 2.6-.8-2.6-2.6-.8 2.6-.8.8-2.6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

function Particles() {
  const particles = useMemo(
    () =>
      [
        { x: "8%", y: "18%", s: 8, d: 0.0, o: 0.22 },
        { x: "16%", y: "55%", s: 10, d: 0.8, o: 0.18 },
        { x: "22%", y: "34%", s: 6, d: 1.6, o: 0.2 },
        { x: "28%", y: "72%", s: 12, d: 1.0, o: 0.16 },
        { x: "35%", y: "22%", s: 7, d: 1.4, o: 0.2 },
        { x: "41%", y: "62%", s: 9, d: 0.2, o: 0.14 },
        { x: "48%", y: "40%", s: 12, d: 1.1, o: 0.12 },
        { x: "54%", y: "78%", s: 7, d: 0.4, o: 0.18 },
        { x: "60%", y: "26%", s: 9, d: 1.9, o: 0.16 },
        { x: "66%", y: "58%", s: 6, d: 0.7, o: 0.2 },
        { x: "72%", y: "16%", s: 12, d: 0.5, o: 0.12 },
        { x: "78%", y: "70%", s: 8, d: 1.7, o: 0.16 },
        { x: "84%", y: "38%", s: 10, d: 1.3, o: 0.14 },
        { x: "90%", y: "62%", s: 7, d: 0.9, o: 0.18 },
      ] as const,
    []
  );

  return (
    <div className="particles">
      {particles.map((p, idx) => (
        <span
          key={idx}
          className="particle"
          style={{
            left: p.x,
            top: p.y,
            width: p.s,
            height: p.s,
            opacity: p.o,
            animationDelay: `${p.d}s`,
          }}
        />
      ))}
    </div>
  );
}

const templates = [
  {
    id: "shorts-talking-head",
    name: "YouTube Shorts – Talking Head Tip",
    description: "Quick face-cam style tip video for TikTok, Reels, or Shorts.",
    category: "Shorts",
    prompt:
      "Ultra-sharp portrait of a confident [HOST_DESCRIPTION], speaking directly to camera in a [MOOD] tone, giving a quick tip about [TOPIC]. Background is a softly blurred [LOCATION] with cinematic lighting, 9:16 vertical frame, subtle camera sway, 1080p, high contrast, shallow depth of field, studio-quality lighting.",
  },
  {
    id: "product-spotlight",
    name: "Product Spotlight – Vertical Ad",
    description: "Cinematic vertical ad focusing on your product in use.",
    category: "Product",
    prompt:
      "Cinematic close-ups of [PRODUCT_NAME] being used in a real-world [CONTEXT]. Smooth camera moves around the product, macro detail shots, soft reflections, subtle particles in the air, 9:16 vertical frame, 1080p. High-end commercial look, shallow depth of field, warm highlights, clean background with brand colors [BRAND_COLORS].",
  },
  {
    id: "before-after",
    name: "Before & After – Transformation",
    description: "Visual transformation showing a strong before/after story.",
    category: "Story",
    prompt:
      "Side-by-side before/after sequence showing a [SUBJECT] transforming from [BEFORE_STATE] to [AFTER_STATE]. Camera slowly pushes in, split-screen effect, smooth crossfade, cinematic color grading. 16:9, 1080p, high contrast, clear text labels ‘Before’ and ‘After’ in modern sans-serif font.",
  },
  {
    id: "screen-tutorial",
    name: "App Tutorial – Over-the-Shoulder",
    description: "Show someone using your app with clear UI focus.",
    category: "Tutorial",
    prompt:
      "Over-the-shoulder view of a person using a laptop to demonstrate [APP_TASK] inside [APP_NAME]. Soft-focus hands on keyboard, screen in focus showing a clean UI. Minimal floating callout labels appear next to key UI elements. Neutral modern office background, 16:9, 1080p, calm and professional lighting.",
  },
  {
    id: "lofi-study",
    name: "Lo-fi Study Loop",
    description: "Cozy looping scene perfect for background content.",
    category: "Vibes",
    prompt:
      "Loopable cozy lo-fi scene of [CHARACTER_DESCRIPTION] working at a desk in [ROOM_DESCRIPTION], gentle camera sway, warm lamp light, city lights outside the window, subtle particles floating, soft depth of field. 16:9, 1080p, muted pastel color palette, calm and relaxing vibe.",
  },
  {
    id: "anime-action",
    name: "Anime – Action Sequence",
    description: "Dynamic anime-style action moment.",
    category: "Anime",
    prompt:
      "High-energy anime-style scene of [CHARACTER_DESCRIPTION] in [LOCATION], performing a dynamic [ACTION]. Bold line art, vibrant colors, motion lines, dramatic lighting, 9:16 vertical frame, camera whip pans and slow-motion moments. Inspired by modern anime openings, crisp 1080p.",
  },
] as const;

export default function TemplatesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();

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
      <Particles />

      {/* SIDEBAR (only visible on home; hidden on Templates) */}
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
            <div className="font-semibold mb-1">How templates work</div>
            <div>Select a template to prefill the main prompt on the Create page. You can tweak details before generating.</div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-20 border-b border-white/10 flex items-center justify-between px-8 glass-panel">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="glow-focus px-3 py-1.5 rounded-full text-[11px] border border-white/20 text-white/75 hover:border-cyan-400/80 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.7)] mr-2"
            >
              ← Home
            </button>
            <div className="glow-pill px-4 py-2 rounded-full text-sm text-white/80 border border-white/10">
              Templates
            </div>
            <div className="hidden md:flex text-sm text-white/50">
              Common video templates to get you started faster.
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                Choose a template
              </h1>
              <p className="mt-2 text-sm md:text-base text-white/60 max-w-2xl">
                Pick a starting point for your video. We&apos;ll prefill the main prompt on the Create page so
                you can customize and generate quickly.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {templates.map((tmpl) => (
                <motion.div
                  key={tmpl.id}
                  whileHover={
                    shouldReduceMotion
                      ? undefined
                      : { y: -6, scale: 1.02 }
                  }
                  whileTap={
                    shouldReduceMotion
                      ? undefined
                      : { scale: 0.98 }
                  }
                  className="rounded-3xl glass-panel border border-white/10 p-5 cursor-pointer"
                  onClick={() => router.push(`/?template=${tmpl.id}`)}
                >
                  <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
                    <span className="px-2 py-0.5 rounded-full border border-white/15 bg-white/5">
                      {tmpl.category}
                    </span>
                  </div>
                  <div className="text-sm md:text-base font-semibold flex items-center gap-2">
                    <SparkIcon className="text-pink-200" />
                    {tmpl.name}
                  </div>
                  <p className="mt-2 text-xs md:text-sm text-white/70">
                    {tmpl.description}
                  </p>
                  <div className="mt-3 text-[11px] text-white/45 line-clamp-3">
                    {tmpl.prompt.replace(/\[[^\]]+\]/g, (m) => m)}
                  </div>
                  <div className="mt-4 flex justify-between items-center text-[11px] text-white/60">
                    <span>Click to use this template</span>
                    <span>&rarr;</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

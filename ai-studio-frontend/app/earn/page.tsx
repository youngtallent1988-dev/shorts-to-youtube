"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

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

export default function EarnCreditsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();

  const nav = [
    { label: "Home", href: "/" },
    { label: "Creation", href: "/creation" },
    { label: "My Videos", href: "/" },
    { label: "Posted", href: "/posted" },
    { label: "Subscribe", href: "/pricing" },
    { label: "Earn credits", href: "/earn" },
  ];

  return (
    <div className="min-h-screen text-white flex cinematic-bg">

      {/* SIDEBAR (only visible on home; hidden on Earn credits) */}
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
            <div className="font-semibold mb-1">Need help?</div>
            <div>Use feedback to tell us how to make SailorAI better and earn bonus credits when reports are accepted.</div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-20 border-b border-white/10 flex items-center justify-between px-8 glass-panel">
          <div className="flex items-center gap-3 min-w-0">
            <div className="glow-pill px-4 py-2 rounded-full text-sm text-white/80 border border-white/10">
              Earn credits
            </div>
            <div className="hidden md:flex text-sm text-white/50">
              Learn all the ways you can earn bonus credits in SailorAI.
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="max-w-5xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                Ways to earn extra credits
              </h1>
              <p className="mt-3 text-sm md:text-base text-white/60 max-w-2xl">
                Credits power your generations. Subscriptions include a monthly amount, and you&apos;ll soon
                be able to top up your balance with simple actions like daily check-ins and inviting
                friends.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Daily check-in */}
              <div className="rounded-3xl glass-panel border border-white/10 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <SparkIcon className="text-pink-200" />
                    Daily check-in
                  </div>
                  <p className="mt-2 text-xs md:text-sm text-white/65">
                    In a future update, you&apos;ll be able to claim a small number of credits once per day
                    just by opening SailorAI. Perfect for creators who like to experiment every day.
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-white/50">
                  <span>Status: Coming soon</span>
                  <span>~10 credits / day</span>
                </div>
              </div>

              {/* Invite friends */}
              <div className="rounded-3xl glass-panel border border-white/10 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <SparkIcon className="text-pink-200" />
                    Invite friends
                  </div>
                  <p className="mt-2 text-xs md:text-sm text-white/65">
                    Soon you&apos;ll be able to share SailorAI with friends and earn bonus credits when they
                    sign up or subscribe using your link. Great for teams and communities.
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-white/50">
                  <span>Status: Coming soon</span>
                  <span>Credits per referral TBA</span>
                </div>
              </div>

              {/* Feedback & bugs */}
              <div className="rounded-3xl glass-panel border border-white/10 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <SparkIcon className="text-pink-200" />
                    Feedback &amp; bug reports
                  </div>
                  <p className="mt-2 text-xs md:text-sm text-white/65">
                    This one is live today. Share helpful feedback or bug reports from the Subscribe
                    page. When we accept a report as useful, we&apos;ll add bonus credits to your account.
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-white/50">
                  <span>Status: Live</span>
                  <span>Up to a few rewards / month</span>
                </div>
              </div>
            </div>

            <div className="mt-8 text-xs md:text-sm text-white/55 max-w-3xl">
              We cap rewards per user per month to keep things fair, but we love detailed, actionable
              feedback. The more clearly you describe issues or ideas, the more likely we are to accept
              them and award credits.
            </div>

            <div className="mt-6 flex gap-3 flex-wrap">
              <motion.button
                type="button"
                onClick={() => router.push("/pricing")}
                whileHover={
                  shouldReduceMotion
                    ? undefined
                    : { y: -2, scale: 1.02 }
                }
                whileTap={
                  shouldReduceMotion
                    ? undefined
                    : { scale: 0.97 }
                }
                className="relative overflow-hidden rounded-full px-5 py-2 text-sm font-black tracking-tight glow-focus border border-pink-400/60 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 shadow-[0_20px_70px_rgba(236,72,153,0.55)] transition-all duration-200"
              >
                <span className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-white/20 via-transparent to-white/10" />
                <span className="relative z-[1]">Go to Subscribe page</span>
              </motion.button>

              <button
                type="button"
                onClick={() => router.push("/pricing#earn")}
                className="glow-focus glow-pill px-5 py-2 rounded-full text-sm text-white/80 border border-white/15"
              >
                Send feedback from Subscribe page
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

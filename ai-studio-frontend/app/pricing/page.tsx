"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";

type Billing = "monthly" | "yearly";

type Plan = {
  id: "free" | "creator" | "pro" | "studio";
  name: string;
  badge?: {
    label: string;
    tone: "popular" | "value";
  };
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  creditsPerMonth: number;
  cta: string;
  highlight?: boolean;
  features: Array<{
    label: string;
    emphasized?: boolean;
  }>;
};

const faqs = [
  {
    id: "what-are-credits",
    question: "What are credits?",
    answer:
      "Credits are the unit SailorAI uses for video generation. Each render consumes credits based on how long the clip is, what resolution you choose, and which model you use.",
  },
  {
    id: "how-does-generation-work",
    question: "How does video generation work?",
    answer:
      "Write a prompt (and optionally upload reference images), pick your settings, and generate. SailorAI turns your inputs into a rendered video you can download, remix, or turn into Shorts.",
  },
  {
    id: "do-credits-rollover",
    question: "Do unused credits roll over?",
    answer:
      "Credits reset every month on all paid plans so billing stays simple and predictable. Unused credits do not roll over to the next month.",
  },
  {
    id: "cancel-anytime",
    question: "Can I cancel anytime?",
    answer:
      "Yes. You can cancel your subscription at any time from your account settings. Your plan stays active until the end of your billing period, and you keep access to remaining credits until then.",
  },
  {
    id: "video-styles",
    question: "What video styles are supported?",
    answer:
      "SailorAI supports cinematic, realistic, stylized, and experimental looks for Shorts, trailers, ads, tutorials, and more.",
  },
  {
    id: "reference-images",
    question: "Can I upload reference images?",
    answer:
      "Yes. On supported plans you can upload reference images to keep characters, environments, and branding consistent across shots.",
  },
  {
    id: "render-time",
    question: "How long does rendering take?",
    answer:
      "Most videos render in seconds to a couple of minutes depending on length, resolution, and queue load. Higher-tier plans have faster queues and priority processing.",
  },
  {
    id: "commercial-use",
    question: "Do you support commercial use?",
    answer:
      "Yes. Commercial use is supported on Pro and Studio plans. Creator is ideal for individual creators and monetized channels. See our terms for full details.",
  },
  {
    id: "refunds",
    question: "How do refunds work?",
    answer:
      "Because compute costs are real-time, we generally can\'t refund used credits. If you run into a billing issue or something breaks, contact support and we\'ll review it case by case.",
  },
] as const;

function CheckIcon({ className = "" }: { className?: string }) {
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
        d="M16.4 5.8L8.6 14.2L3.6 9.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

function Toggle({
  billing,
  setBilling,
}: {
  billing: Billing;
  setBilling: (b: Billing) => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex items-center gap-3">
      <span className={`text-sm ${billing === "monthly" ? "text-white" : "text-white/60"}`}>
        Monthly
      </span>

      <button
        type="button"
        onClick={() => setBilling(billing === "monthly" ? "yearly" : "monthly")}
        className="glow-focus relative w-16 h-9 rounded-full border border-white/10 bg-white/5"
        aria-label="Toggle billing period"
      >
        <motion.span
          layout
          transition={
            shouldReduceMotion
              ? undefined
              : {
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }
          }
          className="absolute top-1 left-1 w-7 h-7 rounded-full bg-gradient-to-r from-cyan-300 via-white to-pink-200"
          style={{
            x: billing === "monthly" ? 0 : 28,
          }}
        />
      </button>

      <span className={`text-sm ${billing === "yearly" ? "text-white" : "text-white/60"}`}>
        Yearly
      </span>

      <span className="ml-2 text-xs px-2 py-1 rounded-full border border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
        Save ~20%
      </span>
    </div>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "popular" | "value";
}) {
  const classes =
    tone === "popular"
      ? "border-pink-400/25 bg-pink-500/15 text-pink-200"
      : "border-orange-400/25 bg-orange-500/15 text-orange-200";

  return (
    <div className={`inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border ${classes}`}>
      <SparkIcon className="opacity-90" />
      <span className="font-black tracking-tight">{label}</span>
    </div>
  );
}

function FAQAccordion() {
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id ?? null);

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {faqs.map((faq) => {
          const isOpen = openId === faq.id;

          return (
            <motion.div
              key={faq.id}
              layout
              initial={false}
              animate={{ borderColor: isOpen ? "rgba(34,211,238,0.45)" : "rgba(255,255,255,0.10)" }}
              className="rounded-3xl glass-panel glow-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : faq.id)}
                className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 glow-focus"
              >
                <div>
                  <div className="text-sm md:text-base font-semibold">
                    {faq.question}
                  </div>
                </div>
                <motion.span
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-white/60 text-lg md:text-xl"
                >
                  ›
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="px-5 pb-4 text-sm md:text-base text-white/65"
                  >
                    {faq.answer}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default function PricingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://sailorai.app";

  const [billing, setBilling] = useState<Billing>("monthly");
  const [checkoutPlan, setCheckoutPlan] = useState<Plan["id"] | null>(null);

  const [user, setUser] = useState<{
    id: number;
    email: string;
    credits: number;
    plan?: string | null;
    subscription_status?: string | null;
    unlimited_generations?: boolean;
    stripe_customer_id?: string | null;
  } | null>(null);

  const [banner, setBanner] = useState<
    null | { tone: "success" | "info" | "error"; title: string; text: string }
  >(null);

  async function refreshMe() {
    try {
      const r = await fetch(`${API_BASE}/me`, {
        method: "GET",
        credentials: "include",
      });
      const data = await r.json();
      setUser(data?.user ?? null);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshMe();

    const params = new URLSearchParams(window.location.search);

    if (params.get("success") === "1") {
      setBanner({
        tone: "success",
        title: "Payment successful",
        text: "If you purchased without signing in, check your email for a sign-in link. Credits unlock after Stripe confirms payment.",
      });
    } else if (params.get("canceled") === "1") {
      setBanner({
        tone: "info",
        title: "Checkout canceled",
        text: "No changes were made. You can restart checkout anytime.",
      });
    }
  }, []);

  async function openBillingPortal() {
    try {
      const r = await fetch(`${API_BASE}/stripe/create-portal-session`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();

      if (!r.ok) {
        setBanner({
          tone: "error",
          title: "Billing portal error",
          text: data?.error || "Could not open billing portal",
        });
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      }

    } catch {
      setBanner({
        tone: "error",
        title: "Billing portal error",
        text: "Could not open billing portal",
      });
    }
  }

  async function startCheckout(planId: Plan["id"]) {
    // Temporary behavior while payments are disabled.
    // Instead of calling Stripe, just show an informational banner.
    if (planId === "free") {
      router.push("/");
      return;
    }

    setBanner({
      tone: "info",
      title: "Upgrades not enabled yet",
      text: "Subscribing and upgrading plans are not wired up in this build. You can keep using the free plan while we finish the billing setup.",
    });
  }

  const plans: Plan[] = useMemo(
    () => [
      {
        id: "free",
        name: "Free",
        description: "Best for trying AI video, testing prompts, and exploring styles before you upgrade.",
        monthlyPrice: 0,
        yearlyPrice: 0,
        creditsPerMonth: 100,
        cta: "Get started free",
        features: [
          { label: "100 monthly credits", emphasized: true },
          { label: "720p rendering" },
          { label: "Watermark enabled" },
          { label: "Basic models" },
          { label: "Standard rendering queue" },
        ],
      },
      {
        id: "creator",
        name: "Creator",
        badge: { label: "Most Popular", tone: "popular" },
        description: "Best for serious solo creators who publish consistently on YouTube, TikTok, Shorts, and Reels.",
        monthlyPrice: 12,
        yearlyPrice: 12 * 12,
        creditsPerMonth: 1200,
        cta: "Upgrade to CREATOR",
        highlight: true,
        features: [
          { label: "1,200 monthly credits", emphasized: true },
          { label: "1080p rendering" },
          { label: "No watermark" },
          { label: "Faster rendering" },
          { label: "Shorts export" },
          { label: "Cinematic models" },
        ],
      },
      {
        id: "pro",
        name: "Pro",
        badge: { label: "Best Value", tone: "value" },
        description: "Best for power users and small teams who need 4K, commercial rights, and priority speed.",
        monthlyPrice: 29,
        yearlyPrice: 29 * 12,
        creditsPerMonth: 6000,
        cta: "Upgrade to PRO",
        features: [
          { label: "6,000 monthly credits", emphasized: true },
          { label: "4K rendering" },
          { label: "Priority queue" },
          { label: "Advanced cinematic models" },
          { label: "Commercial usage" },
          { label: "Batch generation" },
        ],
      },
      {
        id: "studio",
        name: "Studio",
        description: "Best for studios and agencies running high-volume, collaborative video pipelines.",
        monthlyPrice: 79,
        yearlyPrice: 79 * 12,
        creditsPerMonth: 15000,
        cta: "Talk to sales",
        features: [
          { label: "15,000 monthly credits", emphasized: true },
          { label: "Unlimited projects" },
          { label: "API access" },
          { label: "Team collaboration" },
          { label: "Fastest rendering queue" },
        ],
      },
    ],
    []
  );

  const container = {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.7,
        ease: [0.16, 1, 0.3, 1] as const,
        staggerChildren: shouldReduceMotion ? 0 : 0.06,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.6,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
  };

  const nav = [
    { label: "Home", href: "/" },
    { label: "Creation", href: "/creation" },
    { label: "My Videos", href: "/" },
    { label: "Posted", href: "/posted" },
    { label: "Subscribe", href: "/pricing" },
    { label: "Templates", href: "/templates" },
    { label: "AI Images", href: "/" },
    { label: "History", href: "/" },
    { label: "Settings", href: "/" },
  ];

  const currentPlan = (user?.plan ?? null) || "free";

  return (
    <div className="min-h-screen text-white flex cinematic-bg">

      {/* SIDEBAR (only visible on home; hidden on Pricing) */}
      <aside className="hidden">
        <div>
          <div className="p-6 text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-200 via-white to-pink-200 text-transparent bg-clip-text drop-shadow-[0_0_18px_rgba(34,211,238,0.12)]">
            SailorAI
          </div>

          <div className="px-6 pb-4 text-xs text-white/60">
            <div className="uppercase tracking-[0.18em] text-white/40">Current plan</div>
            <div className="mt-1 text-sm font-semibold text-white">
              {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} 
              
              <span className="text-white/40 mx-1">•</span>
              {new Intl.NumberFormat("en-US").format(
                plans.find((p) => p.id === (currentPlan as Plan["id"]))?.creditsPerMonth ?? 100
              )} credits / month
            </div>
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

        <div className="p-4">
          <div className="rounded-3xl bg-gradient-to-br from-pink-500 to-orange-400 p-5 shadow-[0_22px_80px_rgba(236,72,153,0.10)]">
            <div className="text-xs font-semibold tracking-[0.18em] uppercase text-white/80">
              Recommended
            </div>
            <div className="mt-1 text-lg font-black">Creator plan</div>
            <div className="text-sm text-white/85 mt-1">
              1,200 monthly credits, 1080p, no watermark, and faster rendering.
            </div>
            <motion.button
              type="button"
              onClick={() => startCheckout("creator")}
              disabled={currentPlan !== "free"}
              whileHover={
                shouldReduceMotion || currentPlan !== "free"
                  ? undefined
                  : { y: -2, scale: 1.02 }
              }
              whileTap={
                shouldReduceMotion || currentPlan !== "free"
                  ? undefined
                  : { scale: 0.97 }
              }
              className="relative overflow-hidden mt-4 w-full rounded-full px-5 py-3 font-black text-sm tracking-tight glow-focus border border-pink-400/60 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 shadow-[0_20px_70px_rgba(236,72,153,0.55)] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-white/20 via-transparent to-white/10" />
              <span className="relative z-[1]">
                {currentPlan === "free" ? "Upgrade to CREATOR" : "CREATOR active or higher"}
              </span>
            </motion.button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-20 border-b border-white/10 flex items-center justify-between px-8 glass-panel">
          <div className="flex items-center gap-3">
            <div className="glow-pill px-4 py-2 rounded-full text-sm text-white/80 border border-white/10">
              Subscribe
            </div>
            <div className="hidden md:flex text-sm text-white/50">
              Cinematic AI video without the watermark. Unlock higher quality, faster rendering, and export-ready videos.
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap justify-end">
            <Toggle billing={billing} setBilling={setBilling} />

            {user?.stripe_customer_id && (
              <motion.button
                type="button"
                onClick={openBillingPortal}
                whileHover={
                  shouldReduceMotion
                    ? undefined
                    : { y: -1, scale: 1.02 }
                }
                whileTap={
                  shouldReduceMotion
                    ? undefined
                    : { scale: 0.97 }
                }
                className="relative overflow-hidden glow-focus rounded-full px-5 py-2 text-sm font-semibold text-white border border-pink-400/40 bg-white/5 shadow-[0_14px_40px_rgba(236,72,153,0.35)] transition-all duration-200"
              >
                <span className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-purple-500/40 via-pink-500/30 to-orange-400/30" />
                <span className="relative z-[1]">Manage billing</span>
              </motion.button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-10">

          {
            banner && (
              <div
                className={`max-w-6xl mx-auto mb-6 rounded-3xl border p-5 glass-panel ${
                  banner.tone === "success"
                    ? "border-cyan-400/20"
                    : banner.tone === "error"
                      ? "border-pink-400/20"
                      : "border-white/10"
                }`}
              >
                <div className="text-sm font-black">{banner.title}</div>
                <div className="text-sm text-white/70 mt-1">{banner.text}</div>
              </div>
            )
          }
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="max-w-6xl mx-auto"
          >
            <motion.div variants={item} className="mb-10">
              <div className="text-4xl md:text-5xl font-black tracking-tight">
                Cinematic AI video without the watermark
              </div>
              <div className="text-white/60 mt-3 max-w-2xl">
                Upgrade to CREATOR and unlock higher quality, faster rendering, and export-ready videos for YouTube, TikTok, and Shorts.
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {plans.map((p) => {
                const price = billing === "monthly" ? p.monthlyPrice : p.yearlyPrice;
                const priceSuffix = billing === "monthly" ? "/mo" : "/yr";

                const isCurrent =
                  (p.id === "free" && currentPlan === "free") ||
                  (p.id !== "free" && currentPlan === p.id);

                return (
                  <motion.div
                    key={p.id}
                    variants={item}
                    whileHover={
                      shouldReduceMotion
                        ? undefined
                        : {
                            y: -10,
                            scale: 1.01,
                          }
                    }
                    className={`rounded-3xl ${
                      p.highlight
                        ? "pricing-card"
                        : "glass-panel"
                    } border border-white/10 p-6 shadow-[0_26px_90px_rgba(0,0,0,0.55)]`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black tracking-tight flex items-center gap-2">
                          <span>{p.name}</span>
                          {p.highlight ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-cyan-400/10 border border-cyan-400/20 text-cyan-200">
                              Creator-grade
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-white/55 mt-2">
                          {p.description}
                        </div>
                      </div>

                      {p.badge ? (
                        <Badge label={p.badge.label} tone={p.badge.tone} />
                      ) : null}
                    </div>

                    <div className="mt-6">
                      <div className="flex items-end gap-2">
                        <div className="text-4xl font-black tabular-nums">
                          ${price}
                        </div>
                        <div className="text-white/60 pb-1">
                          {priceSuffix}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="credit-badge">
                          {new Intl.NumberFormat("en-US").format(p.creditsPerMonth)} credits / month
                        </span>
                        <span className="text-[11px] text-white/55 flex items-center gap-1">
                          Credits reset monthly; usage varies by length, resolution, and model.
                          <span
                            className="cursor-help text-white/45 border border-white/15 rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                            title="Higher resolutions, longer clips, and more advanced models use more credits per render. Before you generate, SailorAI will show an estimate of how many credits that video will use."
                          >
                            ?
                          </span>
                        </span>
                      </div>

                      {billing === "yearly" && p.monthlyPrice > 0 ? (
                        <div className="text-xs text-white/45 mt-3">
                          Equivalent to ~${Math.round(price / 12)}/mo billed yearly
                        </div>
                      ) : null}
                    </div>

                    <motion.button
                      whileHover={
                        shouldReduceMotion || checkoutPlan === p.id || isCurrent
                          ? undefined
                          : { y: -2, scale: 1.02 }
                      }
                      whileTap={
                        shouldReduceMotion || checkoutPlan === p.id || isCurrent
                          ? undefined
                          : { scale: 0.97 }
                      }
                      type="button"
                      className={`relative overflow-hidden mt-6 w-full rounded-full px-4 py-3 font-black text-sm tracking-tight glow-focus border transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
                        p.highlight
                          ? "border-pink-400/70 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 shadow-[0_20px_80px_rgba(236,72,153,0.55)]"
                          : "border-pink-400/45 bg-gradient-to-r from-purple-500/80 via-pink-500/80 to-orange-400/90 shadow-[0_18px_60px_rgba(236,72,153,0.45)]"
                      }`}
                      onClick={() => startCheckout(p.id)}
                      disabled={checkoutPlan === p.id || isCurrent}
                    >
                      <span className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-white/20 via-transparent to-white/10" />
                      <span className="relative inline-flex items-center justify-center gap-2 z-[1]">
                        <SparkIcon className={p.highlight ? "opacity-90" : "opacity-80"} />
                        {isCurrent
                          ? "Current plan"
                          : checkoutPlan === p.id
                            ? "Opening checkout…"
                            : p.cta}
                      </span>
                    </motion.button>

                    <div className="mt-6">
                      <div className="text-xs font-black text-white/70 uppercase tracking-wider mb-3">
                        What you get
                      </div>
                      <ul className="space-y-2">
                        {p.features.map((f) => (
                          <li
                            key={f.label}
                            className={`flex items-start gap-2 text-sm ${
                              f.emphasized ? "text-white" : "text-white/70"
                            }`}
                          >
                            <CheckIcon className="mt-[2px] text-cyan-200" />
                            <span className={f.emphasized ? "font-semibold" : ""}>
                              {f.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-6 pt-5 border-t border-white/10 text-xs text-white/45">
                      {p.id === "free"
                        ? "No credit card required"
                        : "Cancel anytime. Instant upgrade."}

                      {p.id === "pro" && currentPlan === "creator" && (
                        <button
                          type="button"
                          onClick={() => startCheckout("pro")}
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-200 hover:text-white underline-offset-2 hover:underline"
                        >
                          <SparkIcon className="w-3 h-3" />
                          <span>Upgrade to PRO from Creator</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Feature comparison strip */}
            <motion.div
              variants={item}
              className="mt-10 rounded-3xl glass-panel border border-white/10 p-6"
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-lg font-black">Feature comparison</div>
                  <div className="text-white/60 text-sm mt-2">
                    Compare plans across resolution, watermark, speed, credits, and workflow.
                  </div>
                </div>
                <div className="glow-pill px-4 py-2 rounded-2xl text-sm text-white/80">
                  Free • Creator • Pro • Studio
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <div className="min-w-[640px] text-xs md:text-sm">
                  <div className="grid grid-cols-5 gap-4 pb-3 border-b border-white/10 text-white/60 uppercase tracking-wide">
                    <div>Feature</div>
                    <div className="text-center">Free</div>
                    <div className="text-center">Creator</div>
                    <div className="text-center">Pro</div>
                    <div className="text-center">Studio</div>
                  </div>

                  {[
                    {
                      label: "Monthly credits",
                      values: [
                        "100",
                        "1,200",
                        "6,000",
                        "15,000",
                      ],
                    },
                    {
                      label: "Max resolution",
                      values: [
                        "720p",
                        "1080p",
                        "4K",
                        "4K",
                      ],
                    },
                    {
                      label: "Watermark",
                      values: [
                        "Enabled",
                        "None",
                        "None",
                        "None",
                      ],
                    },
                    {
                      label: "Rendering speed",
                      values: [
                        "Standard",
                        "Faster",
                        "Priority",
                        "Fastest",
                      ],
                    },
                    {
                      label: "Queue priority",
                      values: [
                        "Standard",
                        "Elevated",
                        "High",
                        "Highest",
                      ],
                    },
                    {
                      label: "Shorts export",
                      values: [
                        "Basic",
                        "Optimized",
                        "Optimized",
                        "Optimized",
                      ],
                    },
                    {
                      label: "Models",
                      values: [
                        "Basic",
                        "Cinematic",
                        "Advanced cinematic",
                        "Custom / advanced",
                      ],
                    },
                    {
                      label: "Commercial use",
                      values: [
                        "Personal",
                        "Creator-friendly",
                        "Included",
                        "Included",
                      ],
                    },
                                        {
                    label: "Collaboration & API",
                    values: [
                      "-",
                      "-",
                      "Batch workflows",
                      "Team + API",
                    ],
                    },
                    {
                    label: "Est. credits / 10s @ 1080p",
                    values: [
                      "Varies",
                      "Varies",
                      "Varies",
                      "Varies",
                    ],
                    },
                  ].map((row) => (

                    <div
                      key={row.label}
                      className="grid grid-cols-5 gap-4 py-3 border-b border-white/5 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 text-white/60">
                        <SparkIcon className="w-3 h-3 text-pink-200" />
                        <span>{row.label}</span>
                      </div>
                      {row.values.map((v, idx) => (
                        <div key={`${row.label}-${idx}`} className="text-center text-white/80">
                          {v}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* FAQ section */}
            <motion.section
              variants={item}
              className="mt-16 mb-10 max-w-4xl mx-auto"
            >
              <div className="text-center mb-8">
                <div className="text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">
                  FAQ
                </div>
                <h2 className="mt-3 text-3xl md:text-4xl font-black tracking-tight">
                  Frequently asked questions
                </h2>
                <p className="mt-3 text-sm md:text-base text-white/60 max-w-2xl mx-auto">
                  Everything you need to know about credits, rendering, and how SailorAI fits into your creative workflow.
                </p>
              </div>

              <FAQAccordion />
            </motion.section>

            <div className="h-16" />
          </motion.div>
        </div>
      </main>
    </div>
  );
}

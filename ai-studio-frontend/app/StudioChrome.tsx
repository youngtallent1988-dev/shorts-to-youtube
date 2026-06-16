"use client";

import React, { createContext, type ReactNode, useEffect, useMemo, useState, useContext } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_BASE } from "../lib/apiBase";

// --- User context so pages can refresh credits without duplicating logic ---

export type SailorUser = {
  id: number;
  email: string;
  credits: number;
  plan?: string | null;
  subscription_status?: string | null;
  unlimited_generations?: boolean;
  stripe_customer_id?: string | null;
  avatar_url?: string | null;
};

type UserContextValue = {
  user: SailorUser | null;
  refreshUser: () => Promise<void>;
  setUser: (user: SailorUser | null) => void;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUserContext must be used within StudioChrome");
  }
  return ctx;
}

// --- Shell layout: sidebar + persistent top header ---

const navItems = [
  { label: "Home", href: "/" },
  { label: "Create", href: "/creation" },
  { label: "Edit Videos", href: "/editor" },
  { label: "Posted", href: "/posted" },
  { label: "Subscribe", href: "/pricing" },
  { label: "Mini Apps", href: "/mini-apps" },
  { label: "Agent", href: "/agent" },
] as const;

// Map sidebar nav labels to their icons in a type-safe way so that
// TypeScript will catch any future mismatches between labels and
// comparisons. This also avoids hard-coding string literals like
// "Creation" that aren't part of the navItems union.
type NavLabel = (typeof navItems)[number]["label"];
const NAV_ICONS: Record<NavLabel, string> = {
  Home: "⌂",
  Create: "✦",
  "Edit Videos": "◎",
  Posted: "↑",
  Subscribe: "★",
  "Mini Apps": "◎",
  Agent: "🤖",
};

export default function StudioChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<SailorUser | null>(null);

  const [accountOpen, setAccountOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [devLoginUrl, setDevLoginUrl] = useState("");

  async function refreshUser() {
    try {
      const r = await fetch(`${API_BASE}/me`, {
        method: "GET",
        credentials: "include",
      });
      const data = await r.json();
      setUser((data as any)?.user ?? null);
    } catch (err) {
      console.error("[StudioChrome] Failed to fetch current user — API may be unavailable:", err);
      setUser(null);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await refreshUser();
      } catch (err) {
        console.error("[StudioChrome] Unexpected error during mount user refresh:", err);
        setUser(null);
      }
    })();
  }, []);

  async function requestMagicLink() {
    setAuthStatus("");
    setDevLoginUrl("");

    try {
      const r = await fetch(`${API_BASE}/auth/request-magic-link`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: authEmail }),
      });

      const data = await r.json();

      if (!r.ok) {
        setAuthStatus((data as any)?.error || "Could not send login link");
        return;
      }

      setAuthStatus((data as any)?.message || "Login link sent");
      if ((data as any)?.dev_login_url) {
        setDevLoginUrl((data as any).dev_login_url as string);
      }
    } catch {
      setAuthStatus("Could not send login link");
    }
  }

  async function openBillingPortal() {
    try {
      const r = await fetch(`${API_BASE}/stripe/create-portal-session`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();

      if (!r.ok) {
        setAuthStatus((data as any)?.error || "Could not open billing portal");
        return;
      }

      if ((data as any)?.url) {
        window.location.href = (data as any).url as string;
      }
    } catch {
      setAuthStatus("Could not open billing portal");
    }
  }

  async function logout() {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
      setAccountOpen(false);
    }
  }

  const userContextValue = useMemo<UserContextValue>(
    () => ({ user, refreshUser, setUser }),
    [user]
  );

  return (
    <UserContext.Provider value={userContextValue}>
      <div className="min-h-screen flex bg-[#020617] text-white">
        {/* SIDEBAR */}
        <aside className="hidden md:flex w-24 xl:w-40 flex-col border-r border-white/10 bg-black/90">
          <div className="px-4 pt-5 pb-4 flex flex-col gap-4">
            <div className="mb-2 text-lg font-black tracking-tight text-white">
              Sailor AI
            </div>
            <nav className="flex-1 flex flex-col items-center gap-2 mt-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const icon = NAV_ICONS[item.label] ?? "◎";

                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => router.push(item.href)}
                    className={`glow-focus flex items-center justify-center xl:justify-start gap-2 px-2 py-2 rounded-2xl text-sm tracking-tight border transition w-full ${
                      isActive
                        ? "border-purple-400/80 text-white shadow-[0_0_28px_rgba(168,85,247,0.8)] bg-white/5"
                        : "border-transparent text-white/55 hover:text-white hover:border-white/30 hover:shadow-[0_0_20px_rgba(255,255,255,0.14)]"
                    }`}
                  >
                    <span className="text-lg leading-none">{icon}</span>
                    <span className="hidden xl:inline-block">{item.label}</span>
                  </button>
                );
              })}

            </nav>

            <div className="hidden xl:flex flex-col gap-2 text-[11px] text-white/60">
              <div className="uppercase tracking-[0.2em] text-white/35">Plan</div>
              <button
                type="button"
                onClick={() => router.push("/pricing")}
                className="glow-focus inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border border-pink-400/70 text-white bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 shadow-[0_0_26px_rgba(236,72,153,0.85)] hover:shadow-[0_0_32px_rgba(236,72,153,1)] hover:brightness-110 transition"
              >
                <span className="text-[12px] leading-none">★</span>
                <span>Upgrade</span>
              </button>

              {/* Global Trash shortcut below plan/upgrade */}
              <div className="mt-4 flex justify-center w-full">
                <button
                  type="button"
                  onClick={() => router.push("/editor/trash")}
                  className="glow-focus flex items-center justify-center h-8 w-8 rounded-full border border-red-400/70 text-red-300 hover:text-red-100 hover:border-red-300 text-sm"
                  aria-label="Trash"
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN COLUMN */}
        <div className="flex-1 flex flex-col relative">
          {/* TOP HEADER (persistent) */}
          <header className="sticky top-0 z-40 border-b border-white/10 bg-black/85 backdrop-blur-xl">
            <div className="px-3 md:px-6 h-14 md:h-16 flex items-center justify-between gap-3">
              {/* Left spacer (logo text moved to sidebar nav) */}
              <div className="flex-1 min-w-0" />

              {/* Right: actions (kept consistent across pages) */}
              <div className="flex items-center gap-2 md:gap-3">
                {/* AI platform shortcut */}
                <button
                  type="button"
                  onClick={() => router.push("/creation")}
                  className="hidden sm:inline-flex items-center justify-center px-3 py-1.5 rounded-full text-[11px] font-semibold border border-cyan-400/60 text-cyan-100 bg-cyan-500/10 hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(34,211,238,0.7)] glow-focus transition"
                >
                  AI Studio
                </button>

                {/* Subscribe */}
                <button
                  type="button"
                  onClick={() => router.push("/pricing")}
                  className="hidden sm:inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs font-semibold border border-pink-400/60 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white shadow-[0_0_24px_rgba(236,72,153,0.75)] hover:shadow-[0_0_32px_rgba(236,72,153,0.95)] hover:brightness-110 glow-focus transition"
                >
                  <span className="mr-1 text-[11px]">✦</span>
                  <span>Subscribe</span>
                </button>

                {/* Earn credits */}
                <button
                  type="button"
                  onClick={() => router.push("/earn")}
                  className="hidden md:inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold border border-emerald-400/70 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-white shadow-[0_0_22px_rgba(16,185,129,0.7)] hover:shadow-[0_0_30px_rgba(16,185,129,0.95)] hover:brightness-110 glow-focus transition"
                >
                  <span className="text-[13px] leading-none">✹</span>
                  <span>Earn credits</span>
                </button>

                {/* Credits display */}
                <button
                  type="button"
                  className="glow-focus relative flex items-center justify-center h-9 w-9 rounded-full border border-white/15 bg-transparent text-white/70 hover:text-white hover:border-cyan-400/80 hover:shadow-[0_0_22px_rgba(34,211,238,0.8)] transition"
                  aria-label="Credits"
                >
                  <span className="text-[15px] leading-none">◎</span>
                  {user && !user.unlimited_generations && (
                    <span className="absolute -bottom-1 text-[9px] tabular-nums text-cyan-300">
                      {user.credits}
                    </span>
                  )}
                </button>

                {/* Agent (global) */}
                <button
                  type="button"
                  onClick={() => router.push("/agent")}
                  className="glow-focus flex items-center justify-center h-9 w-9 rounded-full border border-white/15 bg-transparent text-white/70 hover:text-white hover:border-emerald-400/80 hover:shadow-[0_0_22px_rgba(16,185,129,0.8)] transition"
                  aria-label="Agent"
                >
                  <span className="text-[16px] leading-none">🤖</span>
                </button>

                {/* Notifications */}
                <button
                  type="button"
                  className="glow-focus flex items-center justify-center h-9 w-9 rounded-full border border-white/15 bg-transparent text-white/70 hover:text-white hover:border-purple-400/80 hover:shadow-[0_0_22px_rgba(168,85,247,0.8)] transition"
                  aria-label="Notifications"
                >
                  <span className="text-[16px] leading-none">🔔</span>
                </button>

                {/* Settings */}
                <button
                  type="button"
                  className="glow-focus hidden sm:flex items-center justify-center h-9 w-9 rounded-full border border-white/15 bg-transparent text-white/70 hover:text-white hover:border-orange-400/80 hover:shadow-[0_0_22px_rgba(249,115,22,0.8)] transition"
                  aria-label="Settings"
                >
                  <span className="text-[16px] leading-none">⚙</span>
                </button>

                {/* Profile / avatar */}
                <button
                  type="button"
                  onClick={() => setAccountOpen((v) => !v)}
                  className="glow-focus flex items-center justify-center h-9 w-9 rounded-full border border-white/20 bg-white/5 text-xs font-semibold uppercase tracking-[0.16em] hover:border-purple-400/80 hover:shadow-[0_0_22px_rgba(168,85,247,0.8)] transition overflow-hidden"
                  aria-label="Account"
                >
                  {user?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatar_url}
                      alt={user.email}
                      className="h-full w-full object-cover"
                    />
                  ) : user?.email ? (
                    user.email.charAt(0).toUpperCase()
                  ) : (
                    "⋯"
                  )}
                </button>
              </div>
            </div>
          </header>

          {/* Account dropdown + auth status banner */}
          {authStatus && (
            <div className="px-4 md:px-6 pt-2 text-sm text-white/70">{authStatus}</div>
          )}
          {devLoginUrl && (
            <div className="px-4 md:px-6 pb-2 text-sm">
              <a
                href={devLoginUrl}
                className="text-cyan-200 underline"
              >
                Dev login link (click to sign in)
              </a>
            </div>
          )}

          {accountOpen && (
            <div className="absolute right-4 md:right-8 top-20 z-50 w-72 rounded-2xl border border-white/10 bg-black/90 backdrop-blur-xl p-4 shadow-[0_24px_120px_rgba(0,0,0,0.95)]">
              {user ? (
                <>
                  <div className="text-sm font-semibold mb-1">{user.email}</div>
                  <div className="text-xs text-white/60 mb-2">
                    Plan:
                    <span className="ml-1 font-semibold">
                      {user.plan ? user.plan.toUpperCase() : "FREE"}
                    </span>
                  </div>
                  <div className="text-xs text-white/60 mb-4">
                    {user.unlimited_generations ? (
                      <>Unlimited generations</>
                    ) : (
                      <>
                        Credits:
                        <span className="ml-1 tabular-nums">{user.credits}</span>
                      </>
                    )}
                  </div>
                  {user.stripe_customer_id && (
                    <button
                      type="button"
                      onClick={openBillingPortal}
                      className="glow-focus w-full px-3 py-2 mb-2 rounded-xl text-xs font-semibold border border-white/20 text-white/80 hover:border-purple-400/80 hover:text-white hover:shadow-[0_0_22px_rgba(168,85,247,0.8)] transition"
                    >
                      Manage billing
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={logout}
                    className="glow-focus w-full px-3 py-2 rounded-xl text-xs border border-white/20 text-white/70 hover:border-red-400/80 hover:text-red-200 transition"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <div className="text-xs text-white/60 mb-2">
                    Sign in to save your generations
                  </div>
                  <input
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="glow-focus w-full px-3 py-2 rounded-xl text-xs bg-black/40 border border-white/20 outline-none text-white placeholder:text-white/30 mb-3"
                  />
                  <button
                    type="button"
                    onClick={requestMagicLink}
                    className="glow-focus w-full px-3 py-2 rounded-xl text-xs font-semibold border border-purple-400/80 text-white/90 hover:shadow-[0_0_22px_rgba(168,85,247,0.8)] transition"
                  >
                    Send login link
                  </button>
                </>
              )}
            </div>
          )}

          {/* PAGE CONTENT */}
          <main className="flex-1 relative overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </UserContext.Provider>
  );
}

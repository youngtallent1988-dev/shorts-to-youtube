const DEFAULT_API_BASE = "https://sailorai.app";

/**
 * Single source of truth for the backend base URL.
 *
 * Priority (first non-empty wins):
 *   1) NEXT_PUBLIC_API_URL
 *   2) NEXT_PUBLIC_API_BASE
 *   3) API_BASE
 *   4) hard-coded DEFAULT_API_BASE
 *
 * This is safe to use in both server and client components. In the
 * browser bundle, Next.js replaces process.env.* at build time.
 */
function safeReadEnv(key: string): string | undefined {
  try {
    if (typeof process === "undefined" || typeof process.env === "undefined") {
      return undefined;
    }

    const value = process.env[key as keyof NodeJS.ProcessEnv];
    return typeof value === "string" ? value : undefined;
  } catch {
    // In very constrained runtimes (or unusual bundlers) `process` might not
    // exist. In that case we simply treat the env var as unset.
    return undefined;
  }
}

function selectApiBase(): string {
  const candidates = [
    safeReadEnv("NEXT_PUBLIC_API_URL"),
    safeReadEnv("NEXT_PUBLIC_API_BASE"),
    safeReadEnv("API_BASE"),
  ];

  for (const value of candidates) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        // Normalize to avoid trailing slashes so callers can safely
        // do `${API_BASE}/path` without "//" issues.
        return trimmed.replace(/\/+$/, "");
      }
    }
  }

  // As a last resort, if we're running in a browser with no explicit
  // API base configured, fall back to same-origin. This helps when the
  // frontend and backend are deployed behind a single URL.
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return DEFAULT_API_BASE;
}

export const API_BASE = selectApiBase();

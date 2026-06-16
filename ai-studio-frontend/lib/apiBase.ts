// Default backend base URL used when no explicit NEXT_PUBLIC_API_URL is set.
// In production, this should point directly at your Flask API host on Railway.
// You can still override it via NEXT_PUBLIC_API_URL / NEXT_PUBLIC_API_BASE.
const DEFAULT_API_BASE = "https://shorts-to-youtube-production-bab8.up.railway.app";

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
  // API base configured, fall back to DEFAULT_API_BASE (your Flask
  // backend on Railway). This avoids accidentally pointing API calls
  // back at the frontend origin (sailorai.app), which caused 404 HTML
  // responses on /api/assets in production.
  return DEFAULT_API_BASE;
}

export const API_BASE = selectApiBase();

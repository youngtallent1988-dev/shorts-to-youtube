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
      if (!trimmed) continue;

      // Normalize to avoid trailing slashes so callers can safely
      // do `${API_BASE}/path` without "//" issues.
      const normalized = trimmed.replace(/\/+$/, "");

      // In the browser, guard against misconfiguration where the
      // API base is set to the frontend origin (e.g. https://sailorai.app).
      // That would cause calls like `${API_BASE}/api/...` to hit the
      // Next.js app itself and return HTML/404 instead of JSON.
      if (typeof window !== "undefined") {
        try {
          const frontendOrigin = window.location.origin.replace(/\/+$/, "");
          if (normalized === frontendOrigin) {
            // Skip this candidate and keep looking; we'll fall back
            // to DEFAULT_API_BASE (the Flask backend on Railway).
            continue;
          }
        } catch {
          // If anything goes wrong reading window.location, just
          // treat this candidate as-is.
        }
      }

      return normalized;
    }
  }

  // As a last resort, fall back to DEFAULT_API_BASE (your Flask
  // backend on Railway). This avoids accidentally pointing API
  // calls back at the frontend origin when no explicit backend
  // URL is configured.
  return DEFAULT_API_BASE;
}

// Central API base used across client components and route handlers.
//
// In development:
//   - Browser: use relative paths ("") so `/api/*` calls go through
//     Next.js rewrites (see next.config.js) to the local Flask backend
//     on 127.0.0.1:5001 without any CORS issues.
//   - Node (route handlers / server components): talk directly to the
//     local Flask backend at http://127.0.0.1:5001.
//
// In production:
//   - Both browser and Node use selectApiBase(), which prefers
//     NEXT_PUBLIC_API_URL / NEXT_PUBLIC_API_BASE / API_BASE and
//     falls back to DEFAULT_API_BASE (your Railway Flask host).
const isBrowser = typeof window !== "undefined";
const isDev = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

export const API_BASE = isBrowser
  ? (isDev ? "" : selectApiBase())
  : (isDev ? "http://127.0.0.1:5001" : selectApiBase());

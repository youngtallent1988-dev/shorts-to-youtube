/**
 * Helper to call your Flask /api/generate-video endpoint directly.
 *
 * This exercises the same path your frontend uses.
 *
 * Usage (from project root):
 *   cd tools
 *   API_BASE=http://localhost:8080 node api-generate-video.mjs
 */

if (!globalThis.fetch) {
  console.error("[api-generate-video] This script requires Node 18+ (global fetch)." );
  process.exit(1);
}

const API_BASE = process.env.API_BASE || "http://localhost:8080";

async function main() {
  const payload = {
    prompt:
      "Cinematic tracking shot through a neon-lit alley at night, rain on the ground, reflections, 4K",
    model: "MiniMax",
    aspect: "16:9",
    duration: "10s",
    resolution: "1080p",
    generate_audio: true,
    motion_enabled: true,
    speech_enabled: false,
    quality: "high",
    lock_reference: true,
  };

  console.log("[api-generate-video] POST", `${API_BASE}/api/generate-video`);

  const res = await fetch(`${API_BASE}/api/generate-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    // Note: for auth-required paths you would need cookies; this just tests the dev fallback user.
  });

  const body = await res.json().catch(() => null);

  console.log("[api-generate-video] HTTP status:", res.status);
  console.dir(body, { depth: null });

  if (!res.ok) {
    console.error("[api-generate-video] Request failed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[api-generate-video] Unexpected error:");
  console.error(err);
  process.exit(1);
});

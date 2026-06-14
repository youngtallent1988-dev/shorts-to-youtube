/**
 * Test script for your Veo 3 Lite HTTP endpoints.
 *
 * Uses the same env vars as the Flask backend:
 *   GOOGLE_API_KEY
 *   VEO_GENERATE_URL   (e.g. https://your-veo-endpoint/generate)
 *   VEO_STATUS_URL     (e.g. https://your-veo-endpoint/status)
 *
 * Usage (from project root):
 *   cd tools
 *   GOOGLE_API_KEY=... VEO_GENERATE_URL=... VEO_STATUS_URL=... node veo.mjs
 */

if (!globalThis.fetch) {
  // Node 18+ has global fetch; if you're on older Node this will fail.
  console.error("[veo] This script requires Node 18+ (global fetch)." );
  process.exit(1);
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const VEO_GENERATE_URL = process.env.VEO_GENERATE_URL;
const VEO_STATUS_URL = process.env.VEO_STATUS_URL;

if (!GOOGLE_API_KEY || !VEO_GENERATE_URL || !VEO_STATUS_URL) {
  console.error("[veo] Missing one or more env vars: GOOGLE_API_KEY, VEO_GENERATE_URL, VEO_STATUS_URL");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const prompt =
    "A cinematic tracking shot through a misty forest at sunrise, soft godrays, 4K, slow dramatic camera move";

  const generatePayload = {
    prompt,
    duration: 10,
    aspect_ratio: "16:9",
  };

  console.log("[veo] Calling VEO_GENERATE_URL:", VEO_GENERATE_URL);

  const genRes = await fetch(VEO_GENERATE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GOOGLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(generatePayload),
  });

  const genBody = await genRes.json().catch(() => null);

  console.log("[veo] Generate response status:", genRes.status);
  console.dir(genBody, { depth: null });

  if (!genRes.ok) {
    console.error("[veo] Generate request failed.");
    process.exit(1);
  }

  const jobId =
    genBody?.id || genBody?.job_id || genBody?.name || genBody?.operation_id;

  if (!jobId) {
    console.error("[veo] Could not find a job id in generate response.");
    process.exit(1);
  }

  console.log("[veo] Job id:", jobId);

  const statusBase = VEO_STATUS_URL.replace(/\/+$/, "");

  for (let i = 0; i < 20; i += 1) {
    console.log(`[veo] Polling status attempt ${i + 1}...`);

    const statusRes = await fetch(`${statusBase}/${jobId}`, {
      headers: {
        "Authorization": `Bearer ${GOOGLE_API_KEY}`,
      },
    });

    const statusBody = await statusRes.json().catch(() => null);

    console.log("[veo] Status HTTP:", statusRes.status);
    console.dir(statusBody, { depth: null });

    if (!statusRes.ok) {
      console.error("[veo] Status request failed.");
      process.exit(1);
    }

    const status = statusBody?.status || statusBody?.state;
    const doneFlag =
      typeof statusBody?.done === "boolean" ? statusBody.done : undefined;

    if (status === "succeeded" || status === "completed" || doneFlag === true) {
      // Try to find a video URL in statusBody
      let videoUrl = null;
      const output = statusBody?.output || statusBody?.response;

      const extractUrl = (obj) => {
        if (!obj) return null;
        if (typeof obj === "string") return obj;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const maybe = extractUrl(item);
            if (maybe) return maybe;
          }
          return null;
        }
        if (typeof obj === "object") {
          for (const key of ["video", "video_url", "url", "uri"]) {
            if (typeof obj[key] === "string") return obj[key];
          }
        }
        return null;
      };

      videoUrl = extractUrl(output);

      if (videoUrl) {
        console.log("[veo] Video URL:", videoUrl);
      } else {
        console.log("[veo] Generation appears complete but no video URL found.");
      }

      return;
    }

    await sleep(5000);
  }

  console.log("[veo] Gave up waiting for job to complete after 20 attempts.");
}

main().catch((err) => {
  console.error("[veo] Unexpected error:");
  console.error(err);
  process.exit(1);
});
